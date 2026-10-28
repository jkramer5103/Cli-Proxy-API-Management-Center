/**
 * Pace timeline preferences, kept in this browser across sessions.
 *
 * Keys are quota cache keys (the auth filename), never account identifiers.
 */

export interface PaceTimelinePrefs {
  collapsed: boolean;
  excluded: string[];
  hidden: string[];
}

export const PACE_PREFS_KEY = 'quotaPage.paceTimeline';

export const DEFAULT_PACE_PREFS: PaceTimelinePrefs = {
  collapsed: false,
  excluded: [],
  hidden: [],
};

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

export function parsePacePrefs(raw: string | null): PaceTimelinePrefs {
  if (!raw) return DEFAULT_PACE_PREFS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_PACE_PREFS;
    const record = parsed as Record<string, unknown>;
    return {
      collapsed: record.collapsed === true,
      excluded: stringList(record.excluded),
      hidden: stringList(record.hidden),
    };
  } catch {
    return DEFAULT_PACE_PREFS;
  }
}

export function readPacePrefs(): PaceTimelinePrefs {
  if (typeof window === 'undefined') return DEFAULT_PACE_PREFS;
  try {
    return parsePacePrefs(window.localStorage.getItem(PACE_PREFS_KEY));
  } catch {
    return DEFAULT_PACE_PREFS;
  }
}

export function writePacePrefs(prefs: PaceTimelinePrefs) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PACE_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage full or blocked: the preference just doesn't stick.
  }
}
