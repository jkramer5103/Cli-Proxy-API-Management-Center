import { describe, expect, test } from 'bun:test';
import {
  buildPaceGroups,
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

  test('says speed up when quota will reset unused, on pace within eight points', () => {
    expect(
      readPace('claude', claude([win('seven-day', 10, DAY_MS, WEEK)]), '7d', NOW)?.verdict
    ).toBe('speed');
    expect(verdictFor(2)).toBe('on');
    expect(verdictFor(-2)).toBe('on');
    expect(verdictFor(5)).toBe('on');
    expect(verdictFor(-5)).toBe('on');
    expect(verdictFor(8)).toBe('on');
    expect(verdictFor(-8)).toBe('on');
    expect(verdictFor(8.1)).toBe('speed');
    expect(verdictFor(-8.1)).toBe('slow');
  });

  test('an exhausted window is limited until its reset, with no verdict', () => {
    const reading = readPace('claude', claude([win('five-hour', 100, HOUR_MS, 5)]), '5h', NOW);
    expect(reading).toMatchObject({ state: 'limited', remaining: 0, verdict: null });
    expect(reading?.resetAtMs).toBe(NOW + HOUR_MS);
    expect(reading?.timeLeft).toBe(20);
    expect(reading?.gap).toBe(-20);
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
      prefs,
      NOW,
      ['claude']
    );
    const pool = groups[0]?.pool;
    expect(pool?.members).toBe(2);
    expect(pool?.available).toBe(1);
    expect(pool?.windows['7d']?.remaining).toBeCloseTo(60);
    expect(pool?.windows['7d']?.timeLeft).toBeCloseTo(50);
    expect(pool?.windows['7d']?.gap).toBeCloseTo(10);
    expect(pool?.windows['7d']?.verdict).toBe('speed');
    expect(pool?.windows['5h']).toBeNull();
  });

  test('exhausted members count in both pool quota and time remaining', () => {
    const inputs = [
      { ...account('active', 0, DAY_MS), quota: claude([win('five-hour', 67, HOUR_MS, 5)]) },
      {
        ...account('limited', 0, DAY_MS, 'claude', false),
        quota: claude([win('five-hour', 100, HOUR_MS, 5)]),
      },
    ];
    const pool = buildPaceGroups(inputs, prefs, NOW, ['claude'])[0]?.pool;
    expect(pool?.available).toBe(1);
    expect(pool?.windows['5h']).toMatchObject({
      remaining: 16.5,
      timeLeft: 20,
      gap: -3.5,
      verdict: 'on',
    });
  });

  test('a fully exhausted pool retains its clock and says slow down', () => {
    const pool = buildPaceGroups(
      [
        account('a', 100, 3.5 * DAY_MS, 'claude', false),
        account('b', 100, DAY_MS, 'claude', false),
      ],
      prefs,
      NOW,
      ['claude']
    )[0]?.pool;
    expect(pool?.windows['7d']?.remaining).toBe(0);
    expect(pool?.windows['7d']?.timeLeft).toBeCloseTo((50 + 100 / 7) / 2);
    expect(pool?.windows['7d']?.verdict).toBe('slow');
  });

  test('unknown clocks suppress pool ticks and verdicts without dropping quota', () => {
    for (const window of [
      win('seven-day', 0, null, WEEK),
      { ...win('seven-day', 100, DAY_MS, WEEK), periodHours: null },
      { ...win('seven-day', 60, DAY_MS, WEEK), periodHours: null },
    ]) {
      const inputs = [
        account('known', 10, DAY_MS),
        { ...account('unknown', 0, DAY_MS), quota: claude([window]) },
      ];
      const pool = buildPaceGroups(inputs, prefs, NOW, ['claude'])[0]?.pool;
      expect(pool?.windows['7d']).toMatchObject({
        remaining: (90 + 100 - window.usedPercent) / 2,
        timeLeft: null,
        gap: null,
        verdict: null,
      });
    }
  });

  test('excluded accounts stay as rows but leave the pool; hidden ones leave both', () => {
    const inputs = [account('a', 10, DAY_MS), account('b', 10, DAY_MS), account('c', 10, DAY_MS)];
    const excluded = buildPaceGroups(
      inputs,
      { excluded: new Set(['a', 'b']), hidden: new Set<string>() },
      NOW,
      ['claude']
    );
    expect(excluded[0]?.accounts).toHaveLength(3);
    expect(excluded[0]?.pool).toBeNull();

    const hidden = buildPaceGroups(
      inputs,
      { excluded: new Set<string>(), hidden: new Set(['c']) },
      NOW,
      ['claude']
    );
    expect(hidden[0]?.accounts.map((item) => item.key)).toEqual(['a', 'b']);
    expect(hidden[0]?.pool?.members).toBe(2);
  });

  test('reads both windows per account and pools each one', () => {
    const input = (key: string, weeklyUsed: number, fiveHourUsed: number): PaceAccountInput => ({
      key,
      title: key,
      provider: 'claude',
      quota: claude([
        win('seven-day', weeklyUsed, 3.5 * DAY_MS, WEEK),
        win('five-hour', fiveHourUsed, 2.5 * HOUR_MS, 5),
      ]),
      available: true,
    });
    const [group] = buildPaceGroups([input('a', 70, 50), input('b', 10, 50)], prefs, NOW, [
      'claude',
    ]);
    expect(group?.accounts[0]?.readings['7d']?.verdict).toBe('slow');
    expect(group?.accounts[0]?.readings['5h']?.verdict).toBe('on');
    expect(group?.pool?.windows['7d']?.remaining).toBeCloseTo(60);
    expect(group?.pool?.windows['5h']).toMatchObject({ remaining: 50, verdict: 'on' });
  });

  test('status explains missing readings; one missing window keeps the other', () => {
    const input: PaceAccountInput = {
      key: 'cx',
      title: 'cx',
      provider: 'codex',
      quota: { status: 'success', windows: [win('weekly', 10, DAY_MS, WEEK)] },
      available: true,
    };
    const weeklyOnly = buildPaceGroups([input], prefs, NOW, ['codex'])[0]?.accounts[0];
    expect(weeklyOnly?.status).toBe('ready');
    expect(weeklyOnly?.readings['5h']).toBeNull();
    const none = buildPaceGroups(
      [{ ...input, quota: { status: 'success', windows: [] } }],
      prefs,
      NOW,
      ['codex']
    )[0]?.accounts[0];
    expect(none?.status).toBe('none');
    const failed = buildPaceGroups([{ ...input, quota: { status: 'error' } }], prefs, NOW, [
      'codex',
    ])[0]?.accounts[0];
    expect(failed?.status).toBe('error');
    const loading = buildPaceGroups([{ ...input, quota: undefined }], prefs, NOW, ['codex'])[0]
      ?.accounts[0];
    expect(loading?.status).toBe('loading');
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
    ).toEqual({ collapsed: true, excluded: ['a'], hidden: [] });
  });
});
