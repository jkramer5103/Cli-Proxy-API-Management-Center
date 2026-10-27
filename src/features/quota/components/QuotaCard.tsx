/**
 * Provider quota card: identity and a one-glance health badge, the quota body,
 * then freshness and actions. Claude observations remain visible while
 * refreshing or after a failed read.
 */

import { useTranslation } from 'react-i18next';
import { IconRefreshCw } from '@/components/ui/icons';
import { useNow } from '@/hooks/useNow';
import type { ClaudeQuotaState } from '@/types';
import { formatInstantShort, formatRelativeInstant, resolveQuotaErrorMessage } from '@/utils/quota';
import { getQuotaCardTitle } from '@/utils/quota/identity';
import {
  getAuthFileIcon,
  THEME_SURFACE_ICON_BACKGROUND,
  getTypeLabel,
  isThemeSurfaceIconProvider,
} from '@/features/authFiles/constants';
import { bindQuotaClasses } from '../types';
import { QUOTA_ADAPTERS, type QuotaCardState } from '../providers';
import { isQuotaRefreshDisabled, type QuotaFileEntry } from '../logic';
import { useClaudeResetGrants } from '../providers/claude/ClaudeResetGrants';
import { ClaudeResetGrantDetails } from '../providers/claude/ClaudeResetGrantDetails';
import { hasClaudeUsageData } from '../providers/claude/data';
import type { QuotaHealth } from '../quotaHealth';
import bodyStyles from './QuotaBody.module.scss';
import styles from './QuotaCard.module.scss';

/** Bind the quota-page styles to the shared rendering contract. */
const quotaClasses = bindQuotaClasses(bodyStyles, 'QuotaBody.module.scss');

export type QuotaCardProps = {
  entry: QuotaFileEntry;
  quota?: QuotaCardState;
  health: QuotaHealth;
  canRefresh: boolean;
  resetting: boolean;
  /** Initial cascade delay; null disables entrance motion for later mounts. */
  onRefresh: () => void;
  onReset: () => void;
};

export function QuotaCard(props: QuotaCardProps) {
  const { entry, quota, health, canRefresh, resetting, onRefresh, onReset } = props;
  const { t, i18n } = useTranslation();
  const now = useNow();
  const locale = i18n.resolvedLanguage;
  const adapter = QUOTA_ADAPTERS[entry.type];
  const file = entry.file;
  const retainedClaudeUsage =
    entry.type === 'claude' && hasClaudeUsageData(quota as ClaudeQuotaState | undefined);
  const title = getQuotaCardTitle(file);

  const status = quota?.status ?? 'idle';
  const loading = status === 'loading';
  const claudeReset = useClaudeResetGrants(
    file,
    entry.type === 'claude' && status !== 'idle',
    !canRefresh || loading || resetting,
    quota,
    onRefresh
  );
  const providerType = entry.type;
  const iconSrc = getAuthFileIcon(providerType);
  const typeLabel = getTypeLabel(t, providerType);
  const errorMessage = resolveQuotaErrorMessage(
    t,
    quota?.errorStatus,
    quota?.error || t('common.unknown_error')
  );
  // Banked Claude resets list under the plan row; the list hides itself when empty.
  const showClaudeReset = entry.type === 'claude' && status === 'success';
  // Only offer the reset when there is one to spend, or an unknown claim to retry.
  const showClaudeResetAction =
    entry.type === 'claude' &&
    (claudeReset.buttonLabel === 'retry' || (claudeReset.count ?? 0) > 0);
  const claudeAfterPlan = showClaudeReset ? (
    <>
      <ClaudeResetGrantDetails grants={claudeReset.grants} classes={quotaClasses} />
      {claudeReset.message && (
        <div role="status" className={quotaClasses.codexResetCreditsError}>
          {t(`claude_reset.${claudeReset.message}`)}
        </div>
      )}
    </>
  ) : undefined;
  const showReset =
    status === 'success' &&
    Boolean(adapter.resetQuota) &&
    quota !== undefined &&
    Boolean(adapter.canResetQuota?.(quota));

  return (
    <article className={styles.card}>
      <header className={styles.head}>
        <span
          className={styles.iconWrap}
          title={typeLabel}
          style={
            isThemeSurfaceIconProvider(providerType)
              ? { background: THEME_SURFACE_ICON_BACKGROUND }
              : undefined
          }
        >
          {iconSrc ? (
            <img src={iconSrc} alt="" className={styles.icon} />
          ) : (
            <span className={styles.iconFallback}>{typeLabel.slice(0, 1).toUpperCase()}</span>
          )}
        </span>
        <span className={styles.fileName} title={file.name}>
          {title}
        </span>
        <HealthBadge health={health} now={now} locale={locale} />
      </header>

      <div className={styles.body}>
        {status === 'idle' && !canRefresh ? (
          <div className={styles.idleHint}>{t(`${adapter.i18nPrefix}.idle`)}</div>
        ) : (status === 'idle' || loading) && !retainedClaudeUsage ? (
          <div className={styles.skeleton} aria-busy="true">
            <span className={styles.srOnly}>{t(`${adapter.i18nPrefix}.loading`)}</span>
            {[0, 1].map((row) => (
              <div key={row} className={styles.skeletonRow} aria-hidden="true">
                <span className={styles.skeletonLabel} />
                <span className={styles.skeletonTrack} />
              </div>
            ))}
          </div>
        ) : status === 'error' ? (
          <div className={styles.errorStrip} role="alert">
            {t(`${adapter.i18nPrefix}.load_failed`, { message: errorMessage })}
          </div>
        ) : quota && !retainedClaudeUsage ? (
          <adapter.Body quota={quota} classes={quotaClasses} afterPlan={claudeAfterPlan} />
        ) : !retainedClaudeUsage ? (
          <div className={styles.idleHint}>{t(`${adapter.i18nPrefix}.idle`)}</div>
        ) : null}
        {loading && retainedClaudeUsage && (
          <div role="status" aria-busy="true" className={quotaClasses.quotaMessage}>
            {t(`${adapter.i18nPrefix}.loading`)}
          </div>
        )}
        {retainedClaudeUsage && quota && (
          <adapter.Body quota={quota} classes={quotaClasses} afterPlan={claudeAfterPlan} />
        )}
      </div>

      {status !== 'idle' && (
        <footer className={styles.actionRow}>
          <span className={styles.updated} aria-live="polite">
            {loading
              ? t('quota_management.updating')
              : quota?.fetchedAt !== undefined && (
                  <span title={formatInstantShort(quota.fetchedAt)}>
                    {now - quota.fetchedAt < 60_000
                      ? t('quota_management.updated_just_now')
                      : t('quota_management.updated_ago', {
                          relative: formatRelativeInstant(quota.fetchedAt, now, locale),
                        })}
                  </span>
                )}
          </span>
          {showClaudeResetAction && (
            <button
              type="button"
              className={styles.actionPill}
              disabled={claudeReset.blocked}
              onClick={claudeReset.confirm}
              title={t(`claude_reset.${claudeReset.buttonLabel}`)}
            >
              <IconRefreshCw size={13} className={claudeReset.busy ? styles.spinning : undefined} />
              {t(`claude_reset.${claudeReset.buttonLabel}`)}
            </button>
          )}
          {showReset && (
            <button
              type="button"
              className={styles.actionPill}
              onClick={onReset}
              disabled={!canRefresh || loading || resetting}
              title={t('codex_quota.reset_button')}
            >
              <IconRefreshCw size={13} className={resetting ? styles.spinning : undefined} />
              {t('codex_quota.reset_button')}
            </button>
          )}
          <button
            type="button"
            className={styles.actionPill}
            onClick={onRefresh}
            disabled={isQuotaRefreshDisabled(canRefresh, loading, resetting || claudeReset.busy)}
            title={t('auth_files.quota_refresh_hint')}
          >
            <IconRefreshCw size={13} className={loading ? styles.spinning : undefined} />
            {t('auth_files.quota_refresh_single')}
          </button>
        </footer>
      )}
    </article>
  );
}

function HealthBadge({
  health,
  now,
  locale,
}: {
  health: QuotaHealth;
  now: number;
  locale?: string;
}) {
  const { t } = useTranslation();
  if (health.status === 'unknown') return null;

  let label: string;
  let tone: 'ok' | 'low' | 'bad';
  if (health.status === 'error') {
    label = t('quota_management.health_error');
    tone = 'bad';
  } else if (health.status === 'limited') {
    label =
      health.limitedUntilMs === null
        ? t('quota_management.health_limited')
        : t('quota_management.health_limited_until', {
            // Short style keeps the badge from squeezing the title on narrow cards.
            relative: formatRelativeInstant(health.limitedUntilMs, now, locale, 'short'),
          });
    tone = 'bad';
  } else {
    label = t('quota_management.percent_left', { percent: Math.round(health.minRemaining ?? 0) });
    tone = health.status === 'low' ? 'low' : 'ok';
  }

  return (
    <span
      className={`${styles.healthBadge} ${styles[`health_${tone}`]}`}
      title={health.limitedUntilMs === null ? undefined : formatInstantShort(health.limitedUntilMs)}
    >
      {label}
    </span>
  );
}
