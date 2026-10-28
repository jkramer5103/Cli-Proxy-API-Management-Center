/**
 * Quota pace overview: one row per account with a pace bar for its 5-hour and
 * its weekly window (quota left against time left), pools per provider on top.
 *
 * All maths lives in quotaPaceModel.ts; this file is layout and preferences.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { IconChevronDown, IconSettings } from '@/components/ui/icons';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { formatInstantShort, formatRelativeInstant, TYPE_COLORS } from '@/utils/quota';
import {
  getAuthFileIcon,
  getTypeLabel,
  isThemeSurfaceIconProvider,
  THEME_SURFACE_ICON_BACKGROUND,
} from '@/features/authFiles/constants';
import type { QuotaProviderType } from '../providers/types';
import {
  buildPaceGroups,
  PACE_VIEWS,
  type PaceAccount,
  type PaceAccountInput,
  type PacePool,
  type PacePoolWindow,
  type PaceReading,
  type PaceVerdict,
  type PaceView,
} from '../quotaPaceModel';
import type { PaceTimelinePrefs } from '../paceTimelinePrefs';
import styles from './QuotaPaceTimeline.module.scss';

export interface QuotaPaceTimelineProps {
  accounts: readonly PaceAccountInput[];
  providerOrder: readonly QuotaProviderType[];
  prefs: PaceTimelinePrefs;
  onPrefsChange: (prefs: PaceTimelinePrefs) => void;
  /** Jump to an account's card. */
  onSelect: (key: string) => void;
  now: number;
  locale?: string;
}

export function QuotaPaceTimeline({
  accounts,
  providerOrder,
  prefs,
  onPrefsChange,
  onSelect,
  now,
  locale,
}: QuotaPaceTimelineProps) {
  const { t } = useTranslation();
  const { collapsed } = prefs;
  const [settingsOpen, setSettingsOpen] = useState(false);

  const hidden = useMemo(() => new Set(prefs.hidden), [prefs.hidden]);
  const excluded = useMemo(() => new Set(prefs.excluded), [prefs.excluded]);
  const groups = useMemo(
    () => buildPaceGroups(accounts, { hidden, excluded }, now, providerOrder),
    [accounts, hidden, excluded, now, providerOrder]
  );

  if (accounts.length === 0) return null;

  return (
    <section className={styles.timeline} aria-label={t('quota_management.pace_title')}>
      <header className={styles.head}>
        <button
          type="button"
          className={styles.titleButton}
          aria-expanded={!collapsed}
          aria-controls="quota-pace-chart"
          onClick={() => onPrefsChange({ ...prefs, collapsed: !collapsed })}
        >
          <IconChevronDown size={16} className={styles.chevron} aria-hidden="true" />
          <h2 className={styles.title}>{t('quota_management.pace_title')}</h2>
        </button>
        {!collapsed && <span className={styles.legend}>{t('quota_management.pace_legend')}</span>}

        <div className={styles.controls}>
          <PaceSettings
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            accounts={accounts}
            providerOrder={providerOrder}
            prefs={prefs}
            onPrefsChange={onPrefsChange}
          />
        </div>
      </header>

      {!collapsed && (
        <div className={styles.chart} id="quota-pace-chart">
          {groups.length === 0 ? (
            <div className={styles.empty}>{t('quota_management.pace_all_hidden')}</div>
          ) : (
            groups.map((group) => (
              <div key={group.provider} className={styles.group}>
                {group.pool && <PoolRow provider={group.provider} pool={group.pool} />}
                {group.accounts.map((account) => (
                  <AccountRow
                    key={account.key}
                    account={account}
                    now={now}
                    locale={locale}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ rows */

function AccountRow({
  account,
  now,
  locale,
  onSelect,
}: {
  account: PaceAccount;
  now: number;
  locale?: string;
  onSelect: (key: string) => void;
}) {
  const { t } = useTranslation();
  const providerLabel = getTypeLabel(t, account.provider);

  return (
    <button
      type="button"
      className={styles.row}
      onClick={() => onSelect(account.key)}
      aria-label={t('quota_management.pace_jump', {
        name: account.title,
        provider: providerLabel,
      })}
    >
      <span className={styles.name}>
        <ProviderIcon provider={account.provider} label={providerLabel} />
        <span className={styles.nameText}>{account.title}</span>
      </span>
      {account.status === 'ready' ? (
        <span className={styles.windows}>
          {PACE_VIEWS.map((view) => (
            <AccountWindow
              key={view}
              view={view}
              reading={account.readings[view]}
              now={now}
              locale={locale}
            />
          ))}
        </span>
      ) : (
        <span className={`${styles.windows} ${styles.muted}`}>{t(statusKey(account.status))}</span>
      )}
    </button>
  );
}

function AccountWindow({
  view,
  reading,
  now,
  locale,
}: {
  view: PaceView;
  reading: PaceReading | null;
  now: number;
  locale?: string;
}) {
  const { t } = useTranslation();
  if (!reading) {
    return (
      <span className={styles.window}>
        <WindowLabel view={view} />
        <span className={styles.muted}>{t(`quota_management.pace_no_window_${view}`)}</span>
      </span>
    );
  }
  return (
    <span className={styles.window} title={readingTooltip(t, view, reading)}>
      <span className={styles.barLine}>
        <WindowLabel view={view} />
        <PaceBar remaining={reading.remaining} timeLeft={reading.timeLeft} tone={toneOf(reading)} />
      </span>
      <span className={styles.paceText}>
        <ReadingLabel reading={reading} now={now} locale={locale} />
        {reading.resetAtMs !== null && reading.state !== 'limited' && (
          <span className={styles.resetsIn}>
            {t('quota_management.pace_resets', {
              relative: formatRelativeInstant(reading.resetAtMs, now, locale, 'short'),
            })}
          </span>
        )}
      </span>
    </span>
  );
}

function PoolRow({ provider, pool }: { provider: QuotaProviderType; pool: PacePool }) {
  const { t } = useTranslation();
  const label = getTypeLabel(t, provider);

  return (
    <div
      className={`${styles.row} ${styles.poolRow}`}
      style={{ '--pool-color': providerColor(provider) } as CSSProperties}
    >
      <span className={styles.name}>
        <ProviderIcon provider={provider} label={label} />
        <span className={styles.poolName}>
          <span className={styles.nameText}>
            {t('quota_management.pace_pool', { provider: label })}
          </span>
          <span className={styles.poolMeta}>
            {t('quota_management.pace_pool_available', {
              available: pool.available,
              total: pool.members,
            })}
          </span>
        </span>
      </span>
      <span className={styles.windows}>
        {PACE_VIEWS.map((view) => (
          <PoolWindow key={view} view={view} window={pool.windows[view]} />
        ))}
      </span>
    </div>
  );
}

function PoolWindow({ view, window }: { view: PaceView; window: PacePoolWindow | null }) {
  const { t } = useTranslation();
  if (!window) {
    return (
      <span className={styles.window}>
        <WindowLabel view={view} />
        <span className={styles.muted}>{t(`quota_management.pace_no_window_${view}`)}</span>
      </span>
    );
  }
  return (
    <span className={styles.window}>
      <span className={styles.barLine}>
        <WindowLabel view={view} />
        <PaceBar
          remaining={window.remaining}
          timeLeft={window.timeLeft}
          tone={window.verdict ?? 'plain'}
        />
      </span>
      <span className={styles.paceText}>
        {window.verdict && <VerdictChip verdict={window.verdict} />}
        <span className={styles.percent}>
          {t('quota_management.percent_left', { percent: Math.round(window.remaining) })}
        </span>
      </span>
    </span>
  );
}

/* ----------------------------------------------------------- primitives */

function ProviderIcon({ provider, label }: { provider: QuotaProviderType; label: string }) {
  const icon = getAuthFileIcon(provider);
  if (!icon) return null;
  return (
    <span
      className={styles.providerIcon}
      title={label}
      style={
        isThemeSurfaceIconProvider(provider)
          ? { background: THEME_SURFACE_ICON_BACKGROUND }
          : undefined
      }
    >
      <img src={icon} alt="" />
    </span>
  );
}

function WindowLabel({ view }: { view: PaceView }) {
  const { t } = useTranslation();
  return (
    <span className={styles.windowLabel} title={t(`quota_management.pace_window_${view}_full`)}>
      {t(`quota_management.pace_window_${view}`)}
    </span>
  );
}

type Tone = PaceVerdict | 'limited' | 'fresh' | 'plain';

function toneOf(reading: PaceReading): Tone {
  if (reading.state === 'pace') return reading.verdict ?? 'plain';
  return reading.state;
}

/** Fill is quota left; the tick is time left. Fill short of the tick: slow down. */
function PaceBar({
  remaining,
  timeLeft,
  tone,
}: {
  remaining: number;
  timeLeft: number | null;
  tone: Tone;
}) {
  return (
    <span className={styles.bar} data-tone={tone} aria-hidden="true">
      <span className={styles.barFill} style={{ width: `${remaining}%` }} />
      {timeLeft !== null && <span className={styles.barTick} style={{ left: `${timeLeft}%` }} />}
    </span>
  );
}

function VerdictChip({ verdict }: { verdict: PaceVerdict }) {
  const { t } = useTranslation();
  return (
    <span className={styles.verdict} data-tone={verdict}>
      {t(`quota_management.pace_verdict_${verdict}`)}
    </span>
  );
}

function ReadingLabel({
  reading,
  now,
  locale,
}: {
  reading: PaceReading;
  now: number;
  locale?: string;
}) {
  const { t } = useTranslation();
  const percent = (
    <span className={styles.percent}>
      {t('quota_management.percent_left', { percent: Math.round(reading.remaining) })}
    </span>
  );
  switch (reading.state) {
    case 'pace':
      return (
        <>
          {reading.verdict && <VerdictChip verdict={reading.verdict} />}
          {percent}
        </>
      );
    case 'limited':
      return (
        <span className={styles.verdict} data-tone="limited">
          {reading.resetAtMs === null
            ? t('quota_management.health_limited')
            : t('quota_management.health_limited_until', {
                relative: formatRelativeInstant(reading.resetAtMs, now, locale, 'short'),
              })}
        </span>
      );
    case 'fresh':
      return (
        <span className={styles.verdict} data-tone="fresh">
          {t('quota_management.pace_fresh')}
        </span>
      );
    default:
      return percent;
  }
}

/* --------------------------------------------------------------- settings */

function PaceSettings({
  open,
  onOpenChange,
  accounts,
  providerOrder,
  prefs,
  onPrefsChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: readonly PaceAccountInput[];
  providerOrder: readonly QuotaProviderType[];
  prefs: PaceTimelinePrefs;
  onPrefsChange: (prefs: PaceTimelinePrefs) => void;
}) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onOpenChange(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  const toggle = (list: 'excluded' | 'hidden', key: string, on: boolean) => {
    const current = prefs[list].filter((item) => item !== key);
    onPrefsChange({ ...prefs, [list]: on ? [...current, key] : current });
  };

  return (
    <div className={styles.settings} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.cog}
        aria-label={t('quota_management.pace_settings')}
        title={t('quota_management.pace_settings')}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => onOpenChange(!open)}
      >
        <IconSettings size={15} />
      </button>
      {open && (
        <div
          className={styles.popover}
          role="dialog"
          aria-label={t('quota_management.pace_settings')}
        >
          <p className={styles.popoverHint}>{t('quota_management.pace_settings_hint')}</p>
          {providerOrder.map((provider) => {
            const members = accounts.filter((account) => account.provider === provider);
            if (members.length === 0) return null;
            return (
              <div key={provider} className={styles.popoverGroup}>
                <div className={styles.popoverHead}>
                  <span>{getTypeLabel(t, provider)}</span>
                  <span>{t('quota_management.pace_settings_pool')}</span>
                  <span>{t('quota_management.pace_settings_show')}</span>
                </div>
                {members.map((account) => {
                  const isHidden = prefs.hidden.includes(account.key);
                  return (
                    <div key={account.key} className={styles.popoverRow}>
                      <span className={styles.nameText} title={account.key}>
                        {account.title}
                      </span>
                      <ToggleSwitch
                        checked={!isHidden && !prefs.excluded.includes(account.key)}
                        disabled={isHidden}
                        onChange={(on) => toggle('excluded', account.key, !on)}
                        ariaLabel={t('quota_management.pace_settings_pool_label', {
                          name: account.title,
                        })}
                      />
                      <ToggleSwitch
                        checked={!isHidden}
                        onChange={(on) => toggle('hidden', account.key, !on)}
                        ariaLabel={t('quota_management.pace_settings_show_label', {
                          name: account.title,
                        })}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- helpers */

function providerColor(provider: QuotaProviderType): string {
  const set = TYPE_COLORS[provider] || TYPE_COLORS.unknown;
  return (set.dark ?? set.light).text;
}

function statusKey(status: PaceAccount['status']): string {
  if (status === 'error') return 'quota_management.health_error';
  if (status === 'none') return 'quota_management.pace_no_windows';
  return 'quota_management.pace_loading';
}

function readingTooltip(
  t: (key: string, options?: Record<string, unknown>) => string,
  view: PaceView,
  reading: PaceReading
): string {
  const parts = [
    t(`quota_management.pace_window_${view}_full`),
    t('quota_management.percent_left', { percent: Math.round(reading.remaining) }),
  ];
  if (reading.timeLeft !== null) {
    parts.push(t('quota_management.pace_time_left', { percent: Math.round(reading.timeLeft) }));
  }
  if (reading.resetAtMs !== null) {
    parts.push(t('quota_management.pace_resets_at', { at: formatInstantShort(reading.resetAtMs) }));
  }
  return parts.join(' · ');
}
