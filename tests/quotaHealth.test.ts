import { describe, expect, test } from 'bun:test';
import { summarizeQuotaHealth } from '../src/features/quota/quotaHealth';

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

const claude = (windows: { id: string; usedPercent: number | null; resetAtMs?: number }[]) => ({
  status: 'success',
  windows,
});

describe('summarizeQuotaHealth', () => {
  test('is unknown before anything loads and error after a failed fetch', () => {
    expect(summarizeQuotaHealth('claude', undefined, NOW).status).toBe('unknown');
    expect(summarizeQuotaHealth('claude', { status: 'idle', windows: [] }, NOW).status).toBe(
      'unknown'
    );
    // Claude keeps stale windows on error; the badge must still say error.
    const stale = { ...claude([{ id: 'five-hour', usedPercent: 10 }]), status: 'error' };
    expect(summarizeQuotaHealth('claude', stale, NOW).status).toBe('error');
  });

  test('reports the lowest remaining window and classifies ok vs low', () => {
    const ok = claude([
      { id: 'five-hour', usedPercent: 38 },
      { id: 'seven-day', usedPercent: 12 },
    ]);
    expect(summarizeQuotaHealth('claude', ok, NOW)).toEqual({
      status: 'ok',
      minRemaining: 62,
      limitedUntilMs: null,
    });
    const low = claude([{ id: 'five-hour', usedPercent: 75 }]);
    expect(summarizeQuotaHealth('claude', low, NOW).status).toBe('low');
  });

  test('a spent primary window limits until its reset; several wait for the last', () => {
    const quota = claude([
      { id: 'five-hour', usedPercent: 100, resetAtMs: NOW + HOUR },
      { id: 'seven-day', usedPercent: 100, resetAtMs: NOW + 30 * HOUR },
    ]);
    expect(summarizeQuotaHealth('claude', quota, NOW)).toEqual({
      status: 'limited',
      minRemaining: 0,
      limitedUntilMs: NOW + 30 * HOUR,
    });
  });

  test('a spent model-scoped window is low, not limited', () => {
    const quota = claude([
      { id: 'five-hour', usedPercent: 20 },
      { id: 'seven-day-sonnet', usedPercent: 100, resetAtMs: NOW + HOUR },
    ]);
    expect(summarizeQuotaHealth('claude', quota, NOW).status).toBe('low');
  });

  test('a spent window whose reset already passed no longer limits', () => {
    const quota = claude([{ id: 'five-hour', usedPercent: 100, resetAtMs: NOW - 1 }]);
    expect(summarizeQuotaHealth('claude', quota, NOW).status).toBe('low');
  });

  test('reads every provider shape', () => {
    expect(
      summarizeQuotaHealth(
        'codex',
        { status: 'success', windows: [{ id: 'weekly', usedPercent: 100, resetAtMs: NOW + HOUR }] },
        NOW
      ).limitedUntilMs
    ).toBe(NOW + HOUR);
    expect(
      summarizeQuotaHealth(
        'antigravity',
        {
          status: 'success',
          groups: [{ buckets: [{ remainingFraction: 0, resetAtMs: NOW + HOUR }] }],
        },
        NOW
      ).status
    ).toBe('limited');
    expect(
      summarizeQuotaHealth('kimi', { status: 'success', rows: [{ used: 25, limit: 100 }] }, NOW)
        .minRemaining
    ).toBe(75);
    expect(
      summarizeQuotaHealth(
        'devin',
        { status: 'success', windows: [{ remainingPercent: 40, resetAtMs: null }] },
        NOW
      ).minRemaining
    ).toBe(40);
    expect(
      summarizeQuotaHealth(
        'xai',
        { status: 'success', billing: { usagePercent: 90, resetAtMs: NOW + HOUR } },
        NOW
      ).status
    ).toBe('low');
    expect(
      summarizeQuotaHealth(
        'meta',
        {
          status: 'success',
          data: { windows: [{ id: 'window', usedPercent: 100, resetAt: NOW / 1000 + 60 }] },
        },
        NOW
      ).limitedUntilMs
    ).toBe(NOW + 60_000);
  });
});
