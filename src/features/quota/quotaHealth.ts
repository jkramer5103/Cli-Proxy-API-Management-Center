/**
 * One-glance health for a credential: can it serve requests right now, and if
 * not, when does it come back.
 *
 * The cards show every window; this answers the question people scan a grid
 * for. It reads each provider's state structurally, like the timeline model,
 * so the badge and the rows can never disagree about what a percentage means.
 */

import type { QuotaProviderType } from './providers/types';

export type QuotaHealthStatus = 'limited' | 'low' | 'ok' | 'error' | 'unknown';

export interface QuotaHealth {
  status: QuotaHealthStatus;
  /** Lowest remaining percent across all windows, 0..100; null when none report one. */
  minRemaining: number | null;
  /** When a limited credential is usable again; null when unknown or not limited. */
  limitedUntilMs: number | null;
}

/** Below this remaining percent a credential counts as running low (matches the red meter). */
export const QUOTA_LOW_THRESHOLD = 30;

interface Gauge {
  remaining: number;
  resetAtMs: number | null;
  /**
   * An exhausted primary window blocks the whole credential. A scoped one (a
   * single model, a side feature) only blocks that slice, so on its own it
   * makes the credential low rather than limited.
   */
  primary: boolean;
}

/** Account-wide windows; anything else these providers report is model- or feature-scoped. */
const PRIMARY_WINDOW_IDS: Partial<Record<QuotaProviderType, ReadonlySet<string>>> = {
  claude: new Set(['five-hour', 'seven-day']),
  codex: new Set(['five-hour', 'weekly', 'monthly']),
};

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number) => Math.min(100, Math.max(0, value));
const resetMs = (value: unknown) => (finite(value) && value > 0 ? value : null);

function collectGauges(provider: QuotaProviderType, quota: object): Gauge[] {
  const gauges: Gauge[] = [];
  const push = (remaining: unknown, resetAtMs: unknown, primary: boolean) => {
    if (finite(remaining))
      gauges.push({ remaining: clamp(remaining), resetAtMs: resetMs(resetAtMs), primary });
  };

  switch (provider) {
    case 'claude':
    case 'codex': {
      const primaryIds = PRIMARY_WINDOW_IDS[provider];
      const windows =
        (
          quota as {
            windows?: { id?: string; usedPercent?: number | null; resetAtMs?: number | null }[];
          }
        ).windows ?? [];
      for (const window of windows) {
        if (!finite(window.usedPercent)) continue;
        push(100 - window.usedPercent, window.resetAtMs, primaryIds?.has(window.id ?? '') ?? true);
      }
      break;
    }
    case 'devin': {
      const windows =
        (quota as { windows?: { remainingPercent?: number | null; resetAtMs?: number | null }[] })
          .windows ?? [];
      windows.forEach((window) => push(window.remainingPercent, window.resetAtMs, true));
      break;
    }
    case 'xai': {
      // Weekly is a rate limit and monthly a spend cap; either one at zero blocks requests.
      const billing = (
        quota as { billing?: { usagePercent?: number | null; resetAtMs?: number | null } | null }
      ).billing;
      if (billing && finite(billing.usagePercent)) {
        push(100 - billing.usagePercent, billing.resetAtMs, true);
      }
      break;
    }
    case 'antigravity': {
      // Buckets are per model family, so none of them is account-wide.
      const groups =
        (
          quota as {
            groups?: {
              buckets?: { remainingFraction?: number | null; resetAtMs?: number | null }[];
            }[];
          }
        ).groups ?? [];
      for (const bucket of groups.flatMap((group) => group.buckets ?? [])) {
        if (finite(bucket.remainingFraction)) {
          push(bucket.remainingFraction * 100, bucket.resetAtMs, false);
        }
      }
      break;
    }
    case 'kimi': {
      const rows =
        (quota as { rows?: { used?: number; limit?: number; resetAtMs?: number | null }[] }).rows ??
        [];
      for (const row of rows) {
        if (!finite(row.used) || !finite(row.limit) || row.limit <= 0) continue;
        push(((row.limit - row.used) / row.limit) * 100, row.resetAtMs, true);
      }
      break;
    }
    case 'meta': {
      const windows =
        (quota as { data?: { windows?: { usedPercent?: number | null; resetAt?: number }[] } }).data
          ?.windows ?? [];
      for (const window of windows) {
        if (!finite(window.usedPercent)) continue;
        // Meta reports resets in Unix seconds.
        push(100 - window.usedPercent, finite(window.resetAt) ? window.resetAt * 1000 : null, true);
      }
      break;
    }
  }
  return gauges;
}

export function summarizeQuotaHealth(
  provider: QuotaProviderType,
  quota: unknown,
  nowMs: number
): QuotaHealth {
  const state = quota as { status?: string } | undefined;
  if (!state) return { status: 'unknown', minRemaining: null, limitedUntilMs: null };
  if (state.status === 'error')
    return { status: 'error', minRemaining: null, limitedUntilMs: null };

  // Loading states either carry nothing or (Claude) the previous windows; both read correctly.
  const gauges = collectGauges(provider, state);
  if (gauges.length === 0) return { status: 'unknown', minRemaining: null, limitedUntilMs: null };

  const minRemaining = Math.min(...gauges.map((gauge) => gauge.remaining));

  // A window whose reset has already passed is back, whatever the snapshot says.
  const exhausted = gauges.filter(
    (gauge) => gauge.remaining <= 0 && (gauge.resetAtMs === null || gauge.resetAtMs > nowMs)
  );
  const blocking = exhausted.some((gauge) => gauge.primary)
    ? exhausted.filter((gauge) => gauge.primary)
    : exhausted.length === gauges.length
      ? exhausted
      : [];

  if (blocking.length > 0) {
    // Usable again only once every blocking window has reset.
    const resets = blocking.map((gauge) => gauge.resetAtMs);
    const limitedUntilMs = resets.every((at): at is number => at !== null)
      ? Math.max(...resets)
      : null;
    return { status: 'limited', minRemaining, limitedUntilMs };
  }

  return {
    status: minRemaining < QUOTA_LOW_THRESHOLD ? 'low' : 'ok',
    minRemaining,
    limitedUntilMs: null,
  };
}
