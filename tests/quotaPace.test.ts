import { describe, expect, test } from 'bun:test';
import {
  axisPercent,
  axisTicks,
  buildPaceGroups,
  collectBanked,
  pickPaceWindow,
  readPace,
  readWindow,
  verdictFor,
  type PaceAccountInput,
} from '@/features/quota/quotaPaceModel';
import { DEFAULT_PACE_PREFS, parsePacePrefs } from '@/features/quota/paceTimelinePrefs';
import { DAY_MS, HOUR_MS } from '@/utils/time/durations';

const NOW = Date.UTC(2026, 9, 28, 12);
const WEEK = 168;

const claude = (windows: object[]) => ({ status: 'success', windows });
const win = (id: string, usedPercent: number, resetInMs: number | null, periodHours: number) => ({
  id,
  usedPercent,
  resetAtMs: resetInMs === null ? null : NOW + resetInMs,
  periodHours,
});

describe('pace readings', () => {
  test('compares quota left with time left in the window', () => {
    // Half the week gone, 70% used: quota is outrunning time.
    const reading = readPace(
      'claude',
      claude([win('seven-day', 70, 3.5 * DAY_MS, WEEK)]),
      '7d',
      NOW
    );
    expect(reading?.state).toBe('pace');
    expect(reading?.remaining).toBe(30);
    expect(reading?.timeLeft).toBeCloseTo(50);
    expect(reading?.gap).toBeCloseTo(-20);
    expect(reading?.verdict).toBe('slow');
    expect(reading?.startMs).toBe(NOW + 3.5 * DAY_MS - WEEK * HOUR_MS);
  });

  test('says speed up when quota will reset unused, on pace within two points', () => {
    expect(
      readPace('claude', claude([win('seven-day', 10, DAY_MS, WEEK)]), '7d', NOW)?.verdict
    ).toBe('speed');
    expect(verdictFor(2)).toBe('on');
    expect(verdictFor(-2)).toBe('on');
    expect(verdictFor(2.1)).toBe('speed');
    expect(verdictFor(-2.1)).toBe('slow');
  });

  test('an exhausted window is limited until its reset, with no verdict', () => {
    const reading = readPace('claude', claude([win('five-hour', 100, HOUR_MS, 5)]), '5h', NOW);
    expect(reading).toMatchObject({ state: 'limited', remaining: 0, verdict: null });
    expect(reading?.resetAtMs).toBe(NOW + HOUR_MS);
  });

  test('an unstarted or already-reset window is fresh', () => {
    expect(readPace('claude', claude([win('five-hour', 0, null, 5)]), '5h', NOW)?.state).toBe(
      'fresh'
    );
    const passed = readPace('claude', claude([win('five-hour', 100, -60_000, 5)]), '5h', NOW);
    expect(passed).toMatchObject({ state: 'fresh', remaining: 100, resetAtMs: null });
  });

  test('a window without a known length shows quota only', () => {
    const reading = readWindow({ remaining: 40, resetAtMs: NOW + DAY_MS, periodHours: null }, NOW);
    expect(reading).toMatchObject({ state: 'plain', remaining: 40, verdict: null, timeLeft: null });
  });

  test('unloaded and failed states have no reading; Claude reloads keep theirs', () => {
    expect(readPace('claude', undefined, '7d', NOW)).toBeNull();
    expect(readPace('claude', { status: 'error', windows: [] }, '7d', NOW)).toBeNull();
    const reloading = { status: 'loading', windows: [win('seven-day', 50, DAY_MS, WEEK)] };
    expect(readPace('claude', reloading, '7d', NOW)?.remaining).toBe(50);
  });
});

describe('window choice per view', () => {
  test('Claude and Codex use their account-wide windows, never model-scoped ones', () => {
    const quota = claude([
      win('seven-day-opus', 100, DAY_MS, WEEK),
      win('seven-day', 20, DAY_MS, WEEK),
      win('five-hour', 40, HOUR_MS, 5),
    ]);
    expect(pickPaceWindow('claude', quota, '7d')?.id).toBe('seven-day');
    expect(pickPaceWindow('claude', quota, '5h')?.id).toBe('five-hour');

    const codex = claude([win('weekly-spark', 90, DAY_MS, WEEK), win('weekly', 10, DAY_MS, WEEK)]);
    expect(pickPaceWindow('codex', codex, '7d')?.id).toBe('weekly');
    expect(pickPaceWindow('codex', codex, '5h')).toBeNull();
  });

  test('other providers split by window length, weekly-closest then tightest', () => {
    const quota = {
      status: 'success',
      groups: [
        {
          buckets: [
            { id: 'a', remainingFraction: 0.8, resetAtMs: NOW + DAY_MS, periodHours: WEEK },
            { id: 'b', remainingFraction: 0.3, resetAtMs: NOW + DAY_MS, periodHours: WEEK },
            { id: 'c', remainingFraction: 0.1, resetAtMs: NOW + HOUR_MS, periodHours: 5 },
          ],
        },
      ],
    };
    expect(pickPaceWindow('antigravity', quota, '7d')?.id).toBe('b');
    expect(pickPaceWindow('antigravity', quota, '5h')?.id).toBe('c');
  });

  test('xAI paces only its weekly limit', () => {
    const weekly = {
      status: 'success',
      billing: { periodType: 'weekly', usagePercent: 25, resetAtMs: NOW + DAY_MS },
    };
    expect(pickPaceWindow('xai', weekly, '7d')).toMatchObject({ remaining: 75, periodHours: WEEK });
    const monthly = { status: 'success', billing: { ...weekly.billing, periodType: 'monthly' } };
    expect(pickPaceWindow('xai', monthly, '7d')).toBeNull();
  });
});

describe('banked resets', () => {
  test('merges Codex credits by expiry and nudges the ones expiring within a day', () => {
    const soon = new Date(NOW + 6 * HOUR_MS).toISOString();
    const later = new Date(NOW + 3 * DAY_MS).toISOString();
    const quota = {
      rateLimitResetCredits: [
        { status: 'available', expiresAt: later },
        { status: 'available', expiresAt: soon },
        { status: 'available', expiresAt: soon },
        { status: 'used', expiresAt: soon },
        { status: 'available', expiresAt: new Date(NOW - HOUR_MS).toISOString() },
      ],
    };
    expect(collectBanked('codex', quota, undefined, NOW)).toEqual([
      { atMs: NOW + 6 * HOUR_MS, count: 2, soon: true },
      { atMs: NOW + 3 * DAY_MS, count: 1, soon: false },
    ]);
  });

  test('counts unused Claude grant resets and drops spent or undated grants', () => {
    const endsAt = new Date(NOW + 2 * DAY_MS).toISOString();
    const grants = [
      { resetsLeft: 2, endsAt },
      { resetsLeft: 0, endsAt },
      { resetsLeft: 1, endsAt: null },
    ];
    expect(collectBanked('claude', undefined, grants, NOW)).toEqual([
      { atMs: NOW + 2 * DAY_MS, count: 2, soon: false },
    ]);
  });
});

describe('groups and pools', () => {
  const account = (
    key: string,
    used: number,
    resetInMs: number,
    provider: 'claude' | 'codex' = 'claude',
    available = true
  ): PaceAccountInput => ({
    key,
    title: `${key}@example.com`,
    provider,
    quota: claude([win(provider === 'claude' ? 'seven-day' : 'weekly', used, resetInMs, WEEK)]),
    available,
  });
  const prefs = { excluded: new Set<string>(), hidden: new Set<string>() };

  test('groups by provider in tab order, soonest reset first', () => {
    const groups = buildPaceGroups(
      [
        account('late', 10, 5 * DAY_MS),
        account('cx', 10, DAY_MS, 'codex'),
        account('soon', 10, DAY_MS),
      ],
      '7d',
      prefs,
      NOW,
      ['claude', 'codex']
    );
    expect(groups.map((group) => group.provider)).toEqual(['claude', 'codex']);
    expect(groups[0]?.accounts.map((item) => item.key)).toEqual(['soon', 'late']);
  });

  test('pools two or more accounts: mean quota, mean gap and who is usable now', () => {
    // a: 30% left, 50% time left (gap −20). b: 90% left, 50% time left (gap +40).
    const groups = buildPaceGroups(
      [account('a', 70, 3.5 * DAY_MS), account('b', 10, 3.5 * DAY_MS, 'claude', false)],
      '7d',
      prefs,
      NOW,
      ['claude']
    );
    const pool = groups[0]?.pool;
    expect(pool?.members).toBe(2);
    expect(pool?.available).toBe(1);
    expect(pool?.remaining).toBeCloseTo(60);
    expect(pool?.timeLeft).toBeCloseTo(50);
    expect(pool?.gap).toBeCloseTo(10);
    expect(pool?.verdict).toBe('speed');
    expect(pool?.resets).toEqual([NOW + 3.5 * DAY_MS, NOW + 3.5 * DAY_MS]);
  });

  test('excluded accounts stay as rows but leave the pool; hidden ones leave both', () => {
    const inputs = [account('a', 10, DAY_MS), account('b', 10, DAY_MS), account('c', 10, DAY_MS)];
    const excluded = buildPaceGroups(
      inputs,
      '7d',
      { excluded: new Set(['a', 'b']), hidden: new Set<string>() },
      NOW,
      ['claude']
    );
    expect(excluded[0]?.accounts).toHaveLength(3);
    expect(excluded[0]?.pool).toBeNull();

    const hidden = buildPaceGroups(
      inputs,
      '7d',
      { excluded: new Set<string>(), hidden: new Set(['c']) },
      NOW,
      ['claude']
    );
    expect(hidden[0]?.accounts.map((item) => item.key)).toEqual(['a', 'b']);
    expect(hidden[0]?.pool?.members).toBe(2);
  });

  test('banked marks only appear on the 7d view; status explains missing readings', () => {
    const input: PaceAccountInput = {
      key: 'cx',
      title: 'cx',
      provider: 'codex',
      quota: {
        status: 'success',
        windows: [win('weekly', 10, DAY_MS, WEEK)],
        rateLimitResetCredits: [
          { status: 'available', expiresAt: new Date(NOW + DAY_MS).toISOString() },
        ],
      },
      available: true,
    };
    expect(
      buildPaceGroups([input], '7d', prefs, NOW, ['codex'])[0]?.accounts[0]?.banked
    ).toHaveLength(1);
    const short = buildPaceGroups([input], '5h', prefs, NOW, ['codex'])[0]?.accounts[0];
    expect(short?.banked).toEqual([]);
    expect(short?.status).toBe('none');
    const failed = buildPaceGroups([{ ...input, quota: { status: 'error' } }], '7d', prefs, NOW, [
      'codex',
    ])[0]?.accounts[0];
    expect(failed?.status).toBe('error');
  });
});

describe('axis', () => {
  test('places instants across the view and drops ones off it', () => {
    expect(axisPercent(NOW, '7d', NOW)).toBe(0);
    expect(axisPercent(NOW + 3.5 * DAY_MS, '7d', NOW)).toBeCloseTo(50);
    expect(axisPercent(NOW + 8 * DAY_MS, '7d', NOW)).toBeNull();
    expect(axisPercent(NOW + 2.5 * HOUR_MS, '5h', NOW)).toBeCloseTo(50);
  });

  test('ticks fall on local midnights for 7d and whole hours for 5h', () => {
    const now = new Date(2026, 9, 28, 14, 20).getTime();
    const days = axisTicks('7d', now);
    expect(days).toHaveLength(7);
    expect(days.every((at) => new Date(at).getHours() === 0)).toBe(true);
    const hours = axisTicks('5h', now);
    expect(hours.map((at) => new Date(at).getHours())).toEqual([15, 16, 17, 18, 19]);
  });

  test('a DST change neither skips nor repeats a midnight', () => {
    const original = Intl.DateTimeFormat().resolvedOptions().timeZone;
    process.env.TZ = 'Europe/Berlin';
    try {
      // Clocks fall back on Sunday 2026-10-25.
      const now = new Date(2026, 9, 22, 9).getTime();
      const days = axisTicks('7d', now).map((at) => new Date(at).getDate());
      expect(days).toEqual([23, 24, 25, 26, 27, 28, 29]);
    } finally {
      process.env.TZ = original;
    }
  });
});

describe('preferences', () => {
  test('parses stored values defensively', () => {
    expect(parsePacePrefs(null)).toEqual(DEFAULT_PACE_PREFS);
    expect(parsePacePrefs('not json')).toEqual(DEFAULT_PACE_PREFS);
    expect(
      parsePacePrefs(
        JSON.stringify({ view: '5h', collapsed: true, excluded: ['a', 1], hidden: 'b' })
      )
    ).toEqual({ view: '5h', collapsed: true, excluded: ['a'], hidden: [] });
    expect(parsePacePrefs(JSON.stringify({ view: '14d' })).view).toBe('7d');
  });
});
