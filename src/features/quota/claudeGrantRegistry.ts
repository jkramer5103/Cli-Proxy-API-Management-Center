/**
 * Banked Claude resets, shared from the cards to the pace timeline.
 *
 * Each Claude card reads its own grants (see useClaudeResetGrants); the
 * timeline only needs their expiries, so cards publish what they read here
 * instead of the timeline issuing a second set of upstream reads. Entries are
 * stamped with the quota cache generation, and a different generation wipes
 * the map, so one session's grants never surface in the next.
 */

import { create } from 'zustand';
import type { AnthropicResetGrant } from '@/services/api/claudeResetGrants';

export type PublishedGrant = Pick<AnthropicResetGrant, 'resetsLeft' | 'endsAt'>;

interface ClaudeGrantRegistry {
  generation: number;
  byKey: Record<string, readonly PublishedGrant[]>;
  publish: (generation: number, key: string, grants: readonly PublishedGrant[]) => void;
}

export const useClaudeGrantRegistry = create<ClaudeGrantRegistry>((set) => ({
  generation: -1,
  byKey: {},
  publish: (generation, key, grants) =>
    set((state) => {
      const byKey = state.generation === generation ? state.byKey : {};
      if (byKey[key] === grants) return state;
      return { generation, byKey: { ...byKey, [key]: grants } };
    }),
}));

/** Grants for the current generation only. */
export function selectClaudeGrants(
  state: Pick<ClaudeGrantRegistry, 'generation' | 'byKey'>,
  generation: number
): Record<string, readonly PublishedGrant[]> {
  return state.generation === generation ? state.byKey : EMPTY;
}

const EMPTY: Record<string, readonly PublishedGrant[]> = {};
