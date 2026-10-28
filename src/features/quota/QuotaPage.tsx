/**
 * Quota page: provider tabs, the pace timeline, then the card grid.
 *
 * Contracts kept across redesigns:
 * - quota loads automatically for what's on screen and refreshes once stale;
 * - cacheGeneration session isolation + request-id dedupe (see useQuotaBatchLoader);
 * - the quota cache is pruned per provider once the file list settles.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconRefreshCw, IconSearch, IconX } from '@/components/ui/icons';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { useNow } from '@/hooks/useNow';
import { useAuthStore, useQuotaStore } from '@/stores';
import { prefersReducedMotion } from '@/hooks/motion';
import type { AuthFileItem } from '@/types';
import { getQuotaCacheKey, getQuotaCardTitle } from '@/utils/quota/identity';
import { ProviderTabs } from '@/features/authFiles/components/ProviderTabs';
import { QuotaCard } from './components/QuotaCard';
import { QuotaPaceTimeline } from './components/QuotaPaceTimeline';
import {
  QUOTA_PAGE_SIZE,
  QUOTA_SORT_MODES,
  QUOTA_TAB_ORDER,
  type QuotaSortMode,
  type QuotaTabId,
} from './constants';
import {
  buildTabCounts,
  visibleQuotaTabs,
  canRefreshQuotaAfterList,
  classifyQuotaFiles,
  filterEntriesByTab,
  filterEntriesBySearch,
  paginate,
  sortQuotaEntries,
  type QuotaFileEntry,
} from './logic';
import { nextRecoveryMs } from './resetSchedule';
import { QUOTA_ADAPTERS, getQuotaSetter, type QuotaCardState } from './providers';
import type { QuotaProviderType } from './providers/types';
import { useQuotaActions } from './hooks/useQuotaActions';
import { summarizeQuotaHealth } from './quotaHealth';
import { useQuotaAutoLoad } from './hooks/useQuotaAutoLoad';
import { useQuotaBatchLoader } from './hooks/useQuotaBatchLoader';
import { readQuotaUiState, writeQuotaUiState } from './uiState';
import { selectClaudeGrants, useClaudeGrantRegistry } from './claudeGrantRegistry';
import { readPacePrefs, writePacePrefs, type PaceTimelinePrefs } from './paceTimelinePrefs';
import type { PaceAccountInput } from './quotaPaceModel';
import styles from './QuotaPage.module.scss';

const SKELETON_CARD_COUNT = 6;

/** How long a card stays emphasized after the timeline jumps to it. */
const HIGHLIGHT_MS = 1600;

export function QuotaPage() {
  const { t, i18n } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);

  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<QuotaTabId>(() => readQuotaUiState()?.tab ?? 'all');
  const [sortMode, setSortMode] = useState<QuotaSortMode>(
    () => readQuotaUiState()?.sortMode ?? 'default'
  );
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const disableControls = connectionStatus !== 'connected';

  /* ---------- 文件列表 ---------- */

  const sessionGeneration = useQuotaStore((state) => state.cacheGeneration);
  const [filesGeneration, setFilesGeneration] = useState<number | null>(null);
  const listRequestRef = useRef(0);
  const loadFiles = useCallback(async () => {
    const requestId = ++listRequestRef.current;
    if (connectionStatus !== 'connected') {
      setFiles([]);
      setFilesGeneration(null);
      setLoading(false);
      return;
    }
    const isCurrent = () =>
      requestId === listRequestRef.current &&
      sessionGeneration === useQuotaStore.getState().cacheGeneration;
    setLoading(true);
    setError('');
    try {
      const data = await authFilesApi.list();
      if (!isCurrent()) return;
      setFiles(data?.files || []);
      setFilesGeneration(sessionGeneration);
    } catch (err: unknown) {
      if (!isCurrent()) return;
      const message = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError(message);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [connectionStatus, sessionGeneration, t]);

  useEffect(() => {
    void loadFiles();
    return () => {
      listRequestRef.current += 1;
    };
  }, [loadFiles]);

  /* ---------- 额度缓存 ----------
   * 排在归类/排序之前：「最快恢复优先」要读它算排序键。 */

  const antigravityQuota = useQuotaStore((state) => state.antigravityQuota);
  const claudeQuota = useQuotaStore((state) => state.claudeQuota);
  const codexQuota = useQuotaStore((state) => state.codexQuota);
  const devinQuota = useQuotaStore((state) => state.devinQuota);
  const kimiQuota = useQuotaStore((state) => state.kimiQuota);
  const metaQuota = useQuotaStore((state) => state.metaQuota);
  const xaiQuota = useQuotaStore((state) => state.xaiQuota);

  const quotaByType = useMemo<Record<QuotaProviderType, Record<string, QuotaCardState>>>(
    () =>
      ({
        antigravity: antigravityQuota,
        claude: claudeQuota,
        codex: codexQuota,
        devin: devinQuota,
        kimi: kimiQuota,
        meta: metaQuota,
        xai: xaiQuota,
      }) as unknown as Record<QuotaProviderType, Record<string, QuotaCardState>>,
    [antigravityQuota, claudeQuota, codexQuota, devinQuota, kimiQuota, metaQuota, xaiQuota]
  );

  const getQuota = useCallback(
    (entry: QuotaFileEntry): QuotaCardState | undefined =>
      quotaByType[entry.type][getQuotaCacheKey(entry.file)],
    [quotaByType]
  );

  /* ---------- 归类 / 过滤 / 排序 / 分页 ---------- */

  // 只在「最快恢复优先」下订阅分钟时钟。默认序下不门控的话，pageItems 每分钟
  // 换一次身份，会反复空转下面那个「刷新全部」的 loading 下降沿 effect。
  const tick = useNow(sortMode !== 'default');
  const sortNow = sortMode === 'default' ? 0 : tick;

  const entries = useMemo(() => classifyQuotaFiles(files), [files]);
  const tabCounts = useMemo(() => buildTabCounts(entries), [entries]);
  const tabIds = useMemo(() => visibleQuotaTabs(tabCounts, tab), [tabCounts, tab]);
  const filteredEntries = useMemo(
    () => filterEntriesBySearch(filterEntriesByTab(entries, tab), search),
    [entries, tab, search]
  );
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const resolveNextRecovery = useCallback(
    (entry: QuotaFileEntry) => nextRecoveryMs(entry.type, getQuota(entry), sortNow),
    [getQuota, sortNow]
  );
  // 排序在分页之前：否则「最快恢复」只在当前页内成立。
  const sortedEntries = useMemo(
    () => sortQuotaEntries(filteredEntries, sortMode, resolveNextRecovery),
    [filteredEntries, sortMode, resolveNextRecovery]
  );

  const { pageItems, currentPage, totalPages } = useMemo(
    () => paginate(sortedEntries, page, QUOTA_PAGE_SIZE),
    [sortedEntries, page]
  );

  const handleTabChange = useCallback((next: string) => {
    setTab(next as QuotaTabId);
    setPage(1);
    writeQuotaUiState({ tab: next as QuotaTabId });
  }, []);

  const handleSortModeChange = useCallback((next: string) => {
    setSortMode(next as QuotaSortMode);
    setPage(1);
    writeQuotaUiState({ sortMode: next as QuotaSortMode });
  }, []);

  const sortOptions = useMemo(
    () =>
      QUOTA_SORT_MODES.map((mode) => ({ value: mode, label: t(`quota_management.sort_${mode}`) })),
    [t]
  );

  // Health reads reset instants, so it follows the minute clock regardless of sort.
  const healthNow = useNow();
  const healthFor = useCallback(
    (entry: QuotaFileEntry) => summarizeQuotaHealth(entry.type, getQuota(entry), healthNow),
    [getQuota, healthNow]
  );

  const { settledCount, limitedCount, attentionCount } = useMemo(() => {
    let settled = 0;
    let limited = 0;
    let attention = 0;
    entries.forEach((entry) => {
      const status = getQuota(entry)?.status;
      if (status === 'success' || status === 'error') settled += 1;
      const health = healthFor(entry).status;
      if (health === 'limited') limited += 1;
      else if (health === 'error') attention += 1;
    });
    return { settledCount: settled, limitedCount: limited, attentionCount: attention };
  }, [entries, getQuota, healthFor]);

  // 剪枝：文件列表落定后，各 provider 缓存只保留仍存在的凭证
  useEffect(() => {
    if (loading || error || filesGeneration !== sessionGeneration) return;
    const survivorsByType = new Map<QuotaProviderType, Set<string>>(
      QUOTA_TAB_ORDER.map((type) => [type, new Set<string>()])
    );
    entries.forEach((entry) => survivorsByType.get(entry.type)?.add(getQuotaCacheKey(entry.file)));

    QUOTA_TAB_ORDER.forEach((type) => {
      const survivors = survivorsByType.get(type) ?? new Set<string>();
      const setQuota = getQuotaSetter(QUOTA_ADAPTERS[type]);
      setQuota((prev) => {
        const staleKeys = Object.keys(prev).filter((name) => !survivors.has(name));
        if (staleKeys.length === 0) return prev;
        const next = { ...prev };
        staleKeys.forEach((name) => delete next[name]);
        return next;
      });
    });
  }, [entries, error, filesGeneration, loading, sessionGeneration]);

  /* ---------- pace timeline ---------- */

  // The timeline follows the provider tab but not the search, so the overview stays whole.
  // Disabled credentials serve nothing and never load, so they stay off it.
  const paceEntries = useMemo(
    () => filterEntriesByTab(entries, tab).filter((entry) => !entry.file.disabled),
    [entries, tab]
  );
  const claudeGrants = useClaudeGrantRegistry((state) =>
    selectClaudeGrants(state, sessionGeneration)
  );
  const paceAccounts = useMemo<PaceAccountInput[]>(
    () =>
      paceEntries.map((entry) => {
        const key = getQuotaCacheKey(entry.file);
        const status = healthFor(entry).status;
        return {
          key,
          title: getQuotaCardTitle(entry.file),
          provider: entry.type,
          quota: getQuota(entry),
          claudeGrants: claudeGrants[key],
          available: status === 'ok' || status === 'low',
        };
      }),
    [paceEntries, getQuota, healthFor, claudeGrants]
  );

  const [pacePrefs, setPacePrefs] = useState<PaceTimelinePrefs>(readPacePrefs);
  const handlePacePrefsChange = useCallback((next: PaceTimelinePrefs) => {
    setPacePrefs(next);
    writePacePrefs(next);
  }, []);

  // Jumping to a card: clear a search that hides it, turn to its page, then scroll.
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const handlePaceSelect = useCallback(
    (key: string) => {
      const entry = entries.find((item) => getQuotaCacheKey(item.file) === key);
      if (!entry) return;
      if (!filterEntriesBySearch([entry], search).length) setSearch('');
      setFocusKey(key);
    },
    [entries, search]
  );

  useEffect(() => {
    if (focusKey === null) return;
    const index = sortedEntries.findIndex((entry) => getQuotaCacheKey(entry.file) === focusKey);
    if (index === -1) return;
    const targetPage = Math.floor(index / QUOTA_PAGE_SIZE) + 1;
    if (targetPage !== currentPage) {
      setPage(targetPage);
      return;
    }
    setFocusKey(null);
    const card = document.querySelector<HTMLElement>(`[data-quota-key="${CSS.escape(focusKey)}"]`);
    card?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'center',
    });
    setHighlightKey(focusKey);
  }, [focusKey, sortedEntries, currentPage]);

  useEffect(() => {
    if (highlightKey === null) return;
    const timeout = window.setTimeout(() => setHighlightKey(null), HIGHLIGHT_MS);
    return () => window.clearTimeout(timeout);
  }, [highlightKey]);

  /* ---------- 加载与操作 ---------- */

  const { batchLoading, loadQuota } = useQuotaBatchLoader();
  const { resettingQuotaName, refreshQuota, resetQuota } = useQuotaActions(disableControls);

  const pendingRefreshRef = useRef<number | null>(null);
  const prevLoadingRef = useRef(loading);

  // 刷新全部：先重取文件列表，待其落定（loading 下降沿）再批量拉当前页额度
  const handleRefreshAll = useCallback(() => {
    if (disableControls) return;
    pendingRefreshRef.current = sessionGeneration;
    void loadFiles();
  }, [disableControls, loadFiles, sessionGeneration]);

  useEffect(() => {
    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = loading;

    const requestedSession = pendingRefreshRef.current;
    if (requestedSession === null) return;
    if (requestedSession !== sessionGeneration) {
      pendingRefreshRef.current = null;
      return;
    }
    if (loading || !wasLoading) return;

    pendingRefreshRef.current = null;
    if (
      canRefreshQuotaAfterList(
        requestedSession,
        sessionGeneration,
        filesGeneration,
        Boolean(error),
        disableControls
      )
    ) {
      void loadQuota(pageItems);
    }
  }, [disableControls, error, filesGeneration, loading, loadQuota, pageItems, sessionGeneration]);

  // Cards on this page plus every timeline account, each loaded once.
  const autoLoadEntries = useMemo(() => {
    const seen = new Set(pageItems);
    return [...pageItems, ...paceEntries.filter((entry) => !seen.has(entry))];
  }, [pageItems, paceEntries]);

  useQuotaAutoLoad(
    autoLoadEntries,
    disableControls ||
      loading ||
      batchLoading ||
      Boolean(error) ||
      filesGeneration !== sessionGeneration,
    loadQuota,
    getQuota
  );

  const canUseActions = !disableControls && !loading && filesGeneration === sessionGeneration;

  /* ---------- 渲染 ---------- */

  const isEmpty = !loading && filteredEntries.length === 0;

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('nav.quota')}
        meta={
          loading ? null : (
            <span>
              {settledCount < entries.length
                ? t('quota_management.header_summary', {
                    loaded: settledCount,
                    total: entries.length,
                  })
                : t('quota_management.header_accounts', { count: entries.length })}
              {limitedCount > 0 && (
                <span className={styles.attentionMeta}>
                  {' · '}
                  {t('quota_management.meta_limited', { count: limitedCount })}
                </span>
              )}
              {attentionCount > 0 && (
                <span className={styles.attentionMeta}>
                  {' · '}
                  {t('quota_management.meta_attention', { count: attentionCount })}
                </span>
              )}
            </span>
          )
        }
        actions={
          <Button
            size="sm"
            onClick={handleRefreshAll}
            loading={loading || batchLoading}
            disabled={disableControls}
          >
            {!(loading || batchLoading) && <IconRefreshCw size={14} />}
            {t('quota_management.refresh_all_credentials')}
          </Button>
        }
      />

      <section className={styles.workbench}>
        {/* 提供商导航与搜索工具栏分层，避免不同控件争夺视觉焦点。 */}
        <div className={styles.tabsRow}>
          <ProviderTabs types={tabIds} counts={tabCounts} active={tab} onChange={handleTabChange} />
        </div>

        {!loading && (
          <QuotaPaceTimeline
            accounts={paceAccounts}
            providerOrder={QUOTA_TAB_ORDER}
            prefs={pacePrefs}
            onPrefsChange={handlePacePrefsChange}
            onSelect={handlePaceSelect}
            now={healthNow}
            locale={i18n.resolvedLanguage}
          />
        )}

        <div className={styles.toolbar}>
          <div className={styles.search}>
            <IconSearch size={16} className={styles.searchIcon} aria-hidden="true" />
            <input
              ref={searchInputRef}
              className={styles.searchInput}
              type="search"
              value={search}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder={t('quota_management.search_placeholder')}
              aria-label={t('quota_management.search_label')}
            />
            {search && (
              <button
                type="button"
                className={styles.clearSearch}
                aria-label={t('quota_management.search_clear')}
                title={t('quota_management.search_clear')}
                onClick={() => {
                  handleSearchChange('');
                  searchInputRef.current?.focus();
                }}
              >
                <IconX size={14} aria-hidden="true" />
              </button>
            )}
          </div>
          <div className={styles.sort}>
            <Select
              value={sortMode}
              options={sortOptions}
              onChange={handleSortModeChange}
              ariaLabel={t('quota_management.sort_label')}
              size="sm"
            />
          </div>
        </div>

        {error && (
          <div className={styles.errorBanner} role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className={styles.grid} aria-hidden="true">
            {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
              <Skeleton key={index} height={168} rounded={14} />
            ))}
          </div>
        ) : isEmpty ? (
          <EmptyState
            title={
              search.trim()
                ? t('quota_management.search_empty_title')
                : tab === 'all'
                  ? t('quota_management.empty_title')
                  : t(`${QUOTA_ADAPTERS[tab].i18nPrefix}.empty_title`)
            }
            description={
              search.trim()
                ? t('quota_management.search_empty_desc')
                : tab === 'all'
                  ? t('quota_management.empty_desc')
                  : t(`${QUOTA_ADAPTERS[tab].i18nPrefix}.empty_desc`)
            }
            action={
              search.trim() ? (
                <Button variant="secondary" size="sm" onClick={() => handleSearchChange('')}>
                  {t('quota_management.search_clear')}
                </Button>
              ) : tab === 'all' ? undefined : (
                <Button variant="secondary" size="sm" onClick={() => handleTabChange('all')}>
                  {t('auth_files.filter_all')}
                </Button>
              )
            }
          />
        ) : (
          <div className={styles.grid}>
            {pageItems.map((entry) => (
              <QuotaCard
                key={`${entry.type}:${getQuotaCacheKey(entry.file)}`}
                entry={entry}
                quota={getQuota(entry)}
                health={healthFor(entry)}
                canRefresh={canUseActions && !entry.file.disabled}
                resetting={resettingQuotaName === getQuotaCacheKey(entry.file)}
                highlighted={highlightKey === getQuotaCacheKey(entry.file)}
                onRefresh={() => void refreshQuota(entry.file, QUOTA_ADAPTERS[entry.type])}
                onReset={() => resetQuota(entry.file, QUOTA_ADAPTERS[entry.type])}
              />
            ))}
          </div>
        )}

        {!loading && filteredEntries.length > QUOTA_PAGE_SIZE && (
          <div className={styles.pagination}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
            >
              {t('auth_files.pagination_prev')}
            </Button>
            <div className={styles.pageInfo}>
              {t('auth_files.pagination_info', {
                current: currentPage,
                total: totalPages,
                count: filteredEntries.length,
              })}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages}
            >
              {t('auth_files.pagination_next')}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
