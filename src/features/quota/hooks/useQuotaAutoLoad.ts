/**
 * Keep the visible page of quota current without a click.
 *
 * Fetches credentials that were never loaded, then refetches any whose last
 * result is older than QUOTA_STALE_MS. Re-evaluates on the shared minute clock
 * and when the tab becomes visible again; a hidden tab fetches nothing.
 *
 * Session isolation is inherited: targets are read from the live store, which
 * is cleared when the connection changes, and loadQuota commits through the
 * cache-generation guard.
 */

import { useEffect, useState } from 'react';
import { useNow } from '@/hooks/useNow';
import { pickAutoLoadTargets, type QuotaFileEntry } from '../logic';
import type { QuotaCardState } from '../providers';

const isDocumentVisible = () =>
  typeof document === 'undefined' || document.visibilityState === 'visible';

export function useQuotaAutoLoad(
  entries: QuotaFileEntry[],
  disabled: boolean,
  loadQuota: (targets: QuotaFileEntry[]) => Promise<void>,
  quotaFor: (entry: QuotaFileEntry) => QuotaCardState | undefined
) {
  const now = useNow();
  const [visible, setVisible] = useState(isDocumentVisible);

  useEffect(() => {
    const onChange = () => setVisible(isDocumentVisible());
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  useEffect(() => {
    if (disabled || !visible) return;
    // Date.now() rather than the minute clock: a tab returning from the
    // background should judge staleness against the real instant.
    const targets = pickAutoLoadTargets(entries, quotaFor, Date.now());
    if (targets.length > 0) void loadQuota(targets);
  }, [disabled, entries, loadQuota, now, quotaFor, visible]);
}
