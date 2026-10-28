/**
 * Quota pace: are you on track to use each window before it resets?
 *
 * Every window has two clocks — how much quota is left and how much of the
 * window is left. Comparing them tells you whether to slow down (quota is
 * running out faster than time) or speed up (quota will reset unused). Each
 * account is read for its 5-hour and its weekly window.
 *
 * Pure functions: no React, no store, and `now` is always passed in.
 */

import { HOUR_MS } from '@/utils/time/durations';
import type { QuotaProviderType } from './providers/types';

export type PaceView = '7d' | '5h';
/** Display order: the short window first, then the weekly one. */
export const PACE_VIEWS: readonly PaceView[] = ['5h', '7d'];

/** Points of drift between quota left and time left that still read as "on pace". */
export const PACE_TOLERANCE = 2;

/** Windows up to this length count as the 5h window; longer ones as the 7d window. */
const SHORT_WINDOW_MAX_HOURS = 12;
const WEEK_HOURS = 7 * 24;

export type PaceVerdict = 'slow' | 'on' | 'speed';

export interface PaceReading {
  /**
   * pace: a running window with a known length, so a verdict applies.
   * fresh: nothing used and no clock running yet (or the reset already passed).
   * limited: exhausted until `resetAtMs`.
   * plain: quota is known but the window length isn't, so no verdict.
   */
  state: 'pace' | 'fresh' | 'limited' | 'plain';
  /** Quota left, 0..100. */
  remaining: number;
  /** Share of the window still to run, 0..100; null without a running clock. */
  timeLeft: number | null;
  /** remaining − timeLeft. Negative: quota is going faster than time. */
  gap: number | null;
  verdict: PaceVerdict | null;
  startMs: number | null;
  resetAtMs: number | null;
}

interface Candidate {
  id?: string;
  remaining: number;
  resetAtMs: number | null;
  periodHours: number | null;
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number) => Math.min(100, Math.max(0, value));
const positive = (value: unknown) => (finite(value) && value > 0 ? value : null);

/** Claude and Codex name their account-wide windows; everything else they report is scoped. */
const NAMED_WINDOWS: Partial<Record<QuotaProviderType, Record<PaceView, readonly string[]>>> = {
  claude: { '7d': ['seven-day'], '5h': ['five-hour'] },
  codex: { '7d': ['weekly', 'monthly'], '5h': ['five-hour'] },
};

function collectCandidates(provider: QuotaProviderType, quota: object): Candidate[] {
  const out: Candidate[] = [];
  const push = (
    id: string | undefined,
    remaining: unknown,
    resetAtMs: unknown,
    period: unknown
  ) => {
    if (finite(remaining)) {
      out.push({
        id,
        remaining: clamp(remaining),
        resetAtMs: positive(resetAtMs),
        periodHours: positive(period),
      });
    }
  };

  switch (provider) {
    case 'claude':
    case 'codex': {
      type W = { id?: string; usedPercent?: number | null; resetAtMs?: number | null };
      const windows = (quota as { windows?: (W & { periodHours?: number | null })[] }).windows;
      for (const w of windows ?? []) {
        if (finite(w.usedPercent)) push(w.id, 100 - w.usedPercent, w.resetAtMs, w.periodHours);
      }
      break;
    }
    case 'devin': {
      type W = { id?: string; remainingPercent?: number | null; resetAtMs?: number | null };
      const windows = (quota as { windows?: (W & { periodHours?: number })[] }).windows;
      for (const w of windows ?? []) push(w.id, w.remainingPercent, w.resetAtMs, w.periodHours);
      break;
    }
    case 'xai': {
      // Only the weekly limit is a quota window; the monthly figure is a billing cycle.
      const billing = (
        quota as {
          billing?: {
            periodType?: string;
            usagePercent?: number | null;
            resetAtMs?: number | null;
            periodHours?: number | null;
          } | null;
        }
      ).billing;
      if (billing?.periodType === 'weekly' && finite(billing.usagePercent)) {
        push(
          'weekly',
          100 - billing.usagePercent,
          billing.resetAtMs,
          billing.periodHours ?? WEEK_HOURS
        );
      }
      break;
    }
    case 'antigravity': {
      type B = { id?: string; remainingFraction?: number | null; resetAtMs?: number | null };
      const groups = (quota as { groups?: { buckets?: (B & { periodHours?: number | null })[] }[] })
        .groups;
      for (const b of (groups ?? []).flatMap((group) => group.buckets ?? [])) {
        if (finite(b.remainingFraction)) {
          push(b.id, b.remainingFraction * 100, b.resetAtMs, b.periodHours);
        }
      }
      break;
    }
    case 'kimi': {
      type R = { id?: string; used?: number; limit?: number; resetAtMs?: number | null };
      const rows = (quota as { rows?: (R & { periodHours?: number | null })[] }).rows;
      for (const r of rows ?? []) {
        if (!finite(r.used) || !finite(r.limit) || r.limit <= 0) continue;
        push(r.id, ((r.limit - r.used) / r.limit) * 100, r.resetAtMs, r.periodHours);
      }
      break;
    }
    case 'meta': {
      type W = { id?: string; usedPercent?: number | null; resetAt?: number };
      const windows = (quota as { data?: { windows?: (W & { durationMinutes?: number })[] } }).data
        ?.windows;
      for (const w of windows ?? []) {
        if (!finite(w.usedPercent)) continue;
        // Meta reports resets in Unix seconds; its weekly bucket carries no duration.
        const minutes = w.id === 'weekly' ? WEEK_HOURS * 60 : w.durationMinutes;
        push(
          w.id,
          100 - w.usedPercent,
          finite(w.resetAt) ? w.resetAt * 1000 : null,
          finite(minutes) ? minutes / 60 : null
        );
      }
      break;
    }
  }
  return out;
}

/** The window a view paces for one account, or null when it has none. */
export function pickPaceWindow(
  provider: QuotaProviderType,
  quota: object,
  view: PaceView
): Candidate | null {
  const candidates = collectCandidates(provider, quota);
  const named = NAMED_WINDOWS[provider]?.[view];
  if (named) {
    for (const id of named) {
      const hit = candidates.find((candidate) => candidate.id === id);
      if (hit) return hit;
    }
    return null;
  }

  // Without names, classify by length; a window of unknown length counts as long.
  const inView = candidates.filter((candidate) =>
    view === '5h'
      ? candidate.periodHours !== null && candidate.periodHours <= SHORT_WINDOW_MAX_HOURS
      : candidate.periodHours === null || candidate.periodHours > SHORT_WINDOW_MAX_HOURS
  );
  if (inView.length === 0) return null;
  // Closest to a week for the 7d view, then the tightest — it's the one that binds.
  const distance = (candidate: Candidate) =>
    view === '7d' ? Math.abs((candidate.periodHours ?? WEEK_HOURS * 4) - WEEK_HOURS) : 0;
  return inView.reduce((best, candidate) => {
    const byDistance = distance(candidate) - distance(best);
    if (byDistance !== 0) return byDistance < 0 ? candidate : best;
    return candidate.remaining < best.remaining ? candidate : best;
  });
}

export function verdictFor(gap: number): PaceVerdict {
  if (gap < -PACE_TOLERANCE) return 'slow';
  if (gap > PACE_TOLERANCE) return 'speed';
  return 'on';
}

/** Read one window against the clock. */
export function readWindow(window: Candidate, nowMs: number): PaceReading {
  const base = { startMs: null, timeLeft: null, gap: null, verdict: null };
  const { resetAtMs } = window;
  // A reset that already passed means the window is back, whatever the snapshot says.
  if (resetAtMs !== null && resetAtMs <= nowMs) {
    return { ...base, state: 'fresh', remaining: 100, resetAtMs: null };
  }
  if (window.remaining <= 0) return { ...base, state: 'limited', remaining: 0, resetAtMs };
  if (resetAtMs === null) {
    return {
      ...base,
      state: window.remaining >= 100 ? 'fresh' : 'plain',
      remaining: window.remaining,
      resetAtMs,
    };
  }
  if (window.periodHours === null) {
    return { ...base, state: 'plain', remaining: window.remaining, resetAtMs };
  }

  const periodMs = window.periodHours * HOUR_MS;
  const timeLeft = clamp(((resetAtMs - nowMs) / periodMs) * 100);
  const gap = window.remaining - timeLeft;
  return {
    state: 'pace',
    remaining: window.remaining,
    timeLeft,
    gap,
    verdict: verdictFor(gap),
    startMs: resetAtMs - periodMs,
    resetAtMs,
  };
}

/** Readable states only: Claude keeps its previous windows while it reloads. */
export function readPace(
  provider: QuotaProviderType,
  quota: unknown,
  view: PaceView,
  nowMs: number
): PaceReading | null {
  const state = quota as { status?: string } | undefined;
  if (!state || (state.status !== 'success' && state.status !== 'loading')) return null;
  const window = pickPaceWindow(provider, state, view);
  return window ? readWindow(window, nowMs) : null;
}

/* ----------------------------------------------------------------- groups */

export interface PaceAccountInput {
  key: string;
  title: string;
  provider: QuotaProviderType;
  quota: unknown;
  /** Usable right now by the card's health rules (not limited, not failing, loaded). */
  available: boolean;
}

export type PaceReadings = Record<PaceView, PaceReading | null>;

export interface PaceAccount {
  key: string;
  title: string;
  provider: QuotaProviderType;
  /** Per window; null until quota loads, or when the account has no such window. */
  readings: PaceReadings;
  status: 'ready' | 'error' | 'loading' | 'none';
}

export interface PacePoolWindow {
  /** Mean quota left across members with a reading. */
  remaining: number;
  /** Mean time left across pacing members. */
  timeLeft: number | null;
  /** Mean of the pacing members' gaps. */
  gap: number | null;
  verdict: PaceVerdict | null;
}

export interface PacePool {
  members: number;
  available: number;
  windows: Record<PaceView, PacePoolWindow | null>;
}

export interface PaceGroup {
  provider: QuotaProviderType;
  pool: PacePool | null;
  accounts: PaceAccount[];
}

export interface PacePrefs {
  /** Accounts left out of their provider pool. */
  excluded: ReadonlySet<string>;
  /** Accounts left off the timeline (and so out of the pool too). */
  hidden: ReadonlySet<string>;
}

const mean = (values: number[]) =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

function statusOf(quota: unknown, readings: PaceReadings): PaceAccount['status'] {
  const status = (quota as { status?: string } | undefined)?.status;
  if (status === 'error') return 'error';
  if (PACE_VIEWS.some((view) => readings[view])) return 'ready';
  if (status === 'success') return 'none';
  return 'loading';
}

function poolWindow(readings: PaceReading[]): PacePoolWindow | null {
  const remaining = mean(readings.map((reading) => reading.remaining));
  if (remaining === null) return null;
  const pacing = readings.filter((reading) => reading.gap !== null && reading.timeLeft !== null);
  const gap = mean(pacing.map((reading) => reading.gap as number));
  return {
    remaining,
    timeLeft: mean(pacing.map((reading) => reading.timeLeft as number)),
    gap,
    verdict: gap === null ? null : verdictFor(gap),
  };
}

export function buildPool(
  accounts: readonly PaceAccount[],
  availability: ReadonlyMap<string, boolean>
): PacePool {
  const windowOf = (view: PaceView) =>
    poolWindow(
      accounts
        .map((account) => account.readings[view])
        .filter((reading): reading is PaceReading => reading !== null)
    );
  return {
    members: accounts.length,
    available: accounts.filter((account) => availability.get(account.key)).length,
    windows: { '5h': windowOf('5h'), '7d': windowOf('7d') },
  };
}

/**
 * Group visible accounts by provider, soonest weekly reset first, each group
 * headed by a pool when two or more of its accounts are pooled.
 */
export function buildPaceGroups(
  inputs: readonly PaceAccountInput[],
  prefs: PacePrefs,
  nowMs: number,
  providerOrder: readonly QuotaProviderType[]
): PaceGroup[] {
  const availability = new Map(inputs.map((input) => [input.key, input.available]));
  const byProvider = new Map<QuotaProviderType, PaceAccount[]>();

  for (const input of inputs) {
    if (prefs.hidden.has(input.key)) continue;
    const readings: PaceReadings = {
      '5h': readPace(input.provider, input.quota, '5h', nowMs),
      '7d': readPace(input.provider, input.quota, '7d', nowMs),
    };
    const account: PaceAccount = {
      key: input.key,
      title: input.title,
      provider: input.provider,
      readings,
      status: statusOf(input.quota, readings),
    };
    byProvider.set(input.provider, [...(byProvider.get(input.provider) ?? []), account]);
  }

  const resetKey = (account: PaceAccount) =>
    account.readings['7d']?.resetAtMs ?? account.readings['5h']?.resetAtMs ?? Infinity;
  return providerOrder
    .filter((provider) => byProvider.has(provider))
    .map((provider) => {
      const accounts = (byProvider.get(provider) ?? []).sort(
        (a, b) => resetKey(a) - resetKey(b) || a.title.localeCompare(b.title)
      );
      const pooled = accounts.filter((account) => !prefs.excluded.has(account.key));
      return {
        provider,
        pool: pooled.length >= 2 ? buildPool(pooled, availability) : null,
        accounts,
      };
    });
}
