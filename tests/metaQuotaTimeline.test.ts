import { describe, expect, test } from 'bun:test';
import { pickPaceWindow } from '@/features/quota/quotaPaceModel';
import { collectQuotaRowInstants, nextRecoveryMs } from '@/features/quota/resetSchedule';
import type { MetaQuotaState } from '@/types';

const NOW_MS = Date.parse('2099-01-01T00:00:00Z');
const unixSeconds = (ms: number) => ms / 1000;

const state = (windows: NonNullable<MetaQuotaState['data']>['windows']): MetaQuotaState => ({
  status: 'success',
  data: {
    planName: 'Muse Pro',
    isSubscriptionActive: true,
    windows,
  },
});

describe('Meta quota reset scheduling', () => {
  test('only consumed windows block recovery sorting and Unix seconds become milliseconds', () => {
    const quota = state([
      {
        id: 'window',
        usedPercent: 0,
        resetAt: unixSeconds(NOW_MS + 60 * 60 * 1000),
        durationMinutes: 60,
      },
      {
        id: 'weekly',
        usedPercent: 25,
        resetAt: unixSeconds(NOW_MS + 7 * 24 * 60 * 60 * 1000),
        durationMinutes: 7 * 24 * 60,
      },
    ]);

    expect(collectQuotaRowInstants('meta', quota)).toEqual([
      {
        rowId: 'weekly',
        atMs: NOW_MS + 7 * 24 * 60 * 60 * 1000,
        kind: 'window',
      },
    ]);
    expect(nextRecoveryMs('meta', quota, NOW_MS)).toBe(NOW_MS + 7 * 24 * 60 * 60 * 1000);
  });

  test('ignores unknown usage and reset instants that are not in the future', () => {
    const quota = state([
      {
        id: 'window',
        usedPercent: null,
        resetAt: unixSeconds(NOW_MS + 60 * 60 * 1000),
        durationMinutes: 60,
      },
      {
        id: 'weekly',
        usedPercent: 50,
        resetAt: unixSeconds(NOW_MS - 1),
        durationMinutes: 7 * 24 * 60,
      },
    ]);

    expect(collectQuotaRowInstants('meta', quota).map((instant) => instant.rowId)).toEqual([
      'weekly',
    ]);
    expect(nextRecoveryMs('meta', quota, NOW_MS)).toBeNull();
  });
});

describe('Meta quota pace windows', () => {
  test('picks the weekly window for 7d and the short one for 5h, in hours', () => {
    const quota = state([
      {
        id: 'window',
        usedPercent: 0,
        resetAt: unixSeconds(NOW_MS + 60 * 60 * 1000),
        durationMinutes: 60,
      },
      {
        id: 'weekly',
        usedPercent: 40,
        resetAt: unixSeconds(NOW_MS + 7 * 24 * 60 * 60 * 1000),
      },
    ]);

    const weekly = pickPaceWindow('meta', quota, '7d');
    expect(weekly?.resetAtMs).toBe(NOW_MS + 7 * 24 * 60 * 60 * 1000);
    expect(weekly?.periodHours).toBe(168);
    expect(weekly?.remaining).toBe(60);

    const short = pickPaceWindow('meta', quota, '5h');
    expect(short?.periodHours).toBe(1);
    expect(short?.remaining).toBe(100);
  });

  test('does not turn null usage into either zero or 100 percent remaining', () => {
    const quota = state([
      {
        id: 'weekly',
        usedPercent: null,
        resetAt: unixSeconds(NOW_MS + 7 * 24 * 60 * 60 * 1000),
      },
    ]);

    expect(pickPaceWindow('meta', quota, '7d')).toBeNull();
  });
});
