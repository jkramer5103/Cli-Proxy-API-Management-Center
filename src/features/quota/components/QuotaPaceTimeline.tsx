/**
 * Quota pace timeline: one row per account, a pace bar per window (quota left
 * against time left) and an axis of upcoming resets and banked-reset expiries.
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
  axisPercent,
  axisTicks,
  buildPaceGroups,
  PACE_VIEWS,
  type BankedMark,
  type PaceAccount,
  type PaceAccountInput,
  type PacePool,
  type PaceReading,
  type PaceVerdict,
  type PaceView,
} from '../quotaPaceModel';
import type { PaceTimelinePrefs } from '../paceTimelinePrefs';
import styles from './QuotaPaceTimeline.module.scss';

/** Pixels kept clear of tick label centres next to the "Now" label. */
const NOW_LABEL_CLEARANCE_PX = 50;
/** Fallback before the axis has been measured (static render). */
const NOW_LABEL_CLEARANCE_PCT = 8;

/** Tracks an element's width so axis labels can avoid pixel collisions. */
function useElementWidth<T extends HTMLElement>() {
  // A callback ref, because the axis mounts and unmounts with the collapse toggle.
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, width] as const;
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const pad = (value: number) => String(value).padStart(2, '0');
const formatClock = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

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
  const { view, collapsed } = prefs;
  const [settingsOpen, setSettingsOpen] = useState(false);

  const hidden = useMemo(() => new Set(prefs.hidden), [prefs.hidden]);
  const excluded = useMemo(() => new Set(prefs.excluded), [prefs.excluded]);
  const groups = useMemo(
    () => buildPaceGroups(accounts, view, { hidden, excluded }, now, providerOrder),
    [accounts, view, hidden, excluded, now, providerOrder]
  );
  const ticks = useMemo(() => axisTicks(view, now), [view, now]);
  const [axisRef, axisWidth] = useElementWidth<HTMLDivElement>();

  if (accounts.length === 0) return null;

  const tickLabel = (at: number) => {
    if (view === '5h') return formatClock(at);
    const day = new Date(at).getDay();
    return t(`quota_management.weekday_${WEEKDAY_KEYS[day]}`);
  };

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
          <div className={styles.modes} role="group" aria-label={t('quota_management.pace_view')}>
            {PACE_VIEWS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => onPrefsChange({ ...prefs, view: value, collapsed: false })}
              >
                {t(`quota_management.pace_view_${value}`)}
              </button>
            ))}
          </div>
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
          <div className={`${styles.row} ${styles.axisRow}`} aria-hidden="true">
            <span />
            <span />
            <div className={styles.axis} ref={axisRef}>
              <span className={styles.nowLabel}>{t('quota_management.pace_now')}</span>
              {ticks.map((at) => {
                const left = axisPercent(at, view, now) ?? 0;
                // A label right next to "Now" would collide with it; the gridline still shows.
                const tooClose =
                  axisWidth > 0
                    ? (left / 100) * axisWidth < NOW_LABEL_CLEARANCE_PX
                    : left < NOW_LABEL_CLEARANCE_PCT;
                return tooClose ? null : (
                  <span key={at} className={styles.tickLabel} style={{ left: `${left}%` }}>
                    {tickLabel(at)}
                  </span>
                );
              })}
            </div>
          </div>

          {groups.length === 0 ? (
            <div className={styles.empty}>{t('quota_management.pace_all_hidden')}</div>
          ) : (
            groups.map((group) => (
              <div key={group.provider} className={styles.group}>
                {group.pool && (
                  <PoolRow
                    provider={group.provider}
                    pool={group.pool}
                    view={view}
                    now={now}
                    ticks={ticks}
                    locale={locale}
                  />
                )}
                {group.accounts.map((account) => (
                  <AccountRow
                    key={account.key}
                    account={account}
                    view={view}
                    now={now}
                    ticks={ticks}
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

interface RowCommon {
  view: PaceView;
  now: number;
  ticks: number[];
  locale?: string;
}

function AccountRow({
  account,
  view,
  now,
  ticks,
  locale,
  onSelect,
}: RowCommon & { account: PaceAccount; onSelect: (key: string) => void }) {
  const { t } = useTranslation();
  const { reading } = account;
  const color = providerColor(account.provider);
  const tooltip = reading ? readingTooltip(t, reading) : undefined;

  return (
    <button
      type="button"
      className={styles.row}
      onClick={() => onSelect(account.key)}
      title={tooltip}
      aria-label={t('quota_management.pace_jump', { name: account.title })}
    >
      <span className={styles.name}>
        <span className={styles.dot} style={{ background: color }} aria-hidden="true" />
        <span className={styles.nameText}>{account.title}</span>
      </span>
      <span className={styles.pace}>
        {reading ? (
          <>
            <PaceBar
              remaining={reading.remaining}
              timeLeft={reading.timeLeft}
              tone={toneOf(reading)}
            />
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
          </>
        ) : (
          <span className={styles.muted}>{t(statusKey(account.status, view))}</span>
        )}
      </span>
      <span className={styles.axis} aria-hidden="true">
        <Gridlines ticks={ticks} view={view} now={now} />
        {reading && <WindowTrack reading={reading} view={view} now={now} />}
        {account.banked.map((mark) => (
          <BankedDiamond key={mark.atMs} mark={mark} view={view} now={now} />
        ))}
      </span>
    </button>
  );
}

function PoolRow({
  provider,
  pool,
  view,
  now,
  ticks,
}: RowCommon & { provider: QuotaProviderType; pool: PacePool }) {
  const { t } = useTranslation();
  const icon = getAuthFileIcon(provider);
  const label = getTypeLabel(t, provider);
  const tone: Tone = pool.verdict ?? 'plain';

  return (
    <div className={`${styles.row} ${styles.poolRow}`}>
      <span className={styles.name}>
        {icon && (
          <span
            className={styles.poolIcon}
            style={
              isThemeSurfaceIconProvider(provider)
                ? { background: THEME_SURFACE_ICON_BACKGROUND }
                : undefined
            }
          >
            <img src={icon} alt="" />
          </span>
        )}
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
      <span className={styles.pace}>
        {pool.remaining === null ? (
          <span className={styles.muted}>{t('quota_management.pace_loading')}</span>
        ) : (
          <>
            <PaceBar remaining={pool.remaining} timeLeft={pool.timeLeft} tone={tone} />
            <span className={styles.paceText}>
              {pool.verdict && <VerdictChip verdict={pool.verdict} />}
              <span className={styles.percent}>
                {t('quota_management.percent_left', { percent: Math.round(pool.remaining) })}
              </span>
            </span>
          </>
        )}
      </span>
      <span className={styles.axis} aria-hidden="true">
        <Gridlines ticks={ticks} view={view} now={now} />
        {pool.resets.map((at, index) => {
          const left = axisPercent(at, view, now);
          return left === null ? null : (
            <span
              key={`${at}-${index}`}
              className={styles.poolReset}
              style={{ left: `${left}%` }}
              title={formatInstantShort(at)}
            />
          );
        })}
      </span>
    </div>
  );
}

/* ----------------------------------------------------------- primitives */

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

function Gridlines({ ticks, view, now }: { ticks: number[]; view: PaceView; now: number }) {
  return (
    <>
      {ticks.map((at) => (
        <span
          key={at}
          className={styles.gridline}
          style={{ left: `${axisPercent(at, view, now)}%` }}
        />
      ))}
    </>
  );
}

/** The rest of the current window, from now to its reset. */
function WindowTrack({
  reading,
  view,
  now,
}: {
  reading: PaceReading;
  view: PaceView;
  now: number;
}) {
  if (reading.resetAtMs === null) return null;
  const left = axisPercent(reading.resetAtMs, view, now);
  const style = { '--reset-at': `${left ?? 100}%` } as CSSProperties;
  return (
    <>
      <span className={styles.track} data-tone={toneOf(reading)} style={style} />
      {left !== null && (
        <span className={styles.resetMark} style={{ left: `${left}%` }}>
          <span className={styles.resetLabel} data-flip={left > 82 ? '1' : undefined}>
            {view === '5h' ? formatClock(reading.resetAtMs) : formatInstantShort(reading.resetAtMs)}
          </span>
        </span>
      )}
    </>
  );
}

function BankedDiamond({ mark, view, now }: { mark: BankedMark; view: PaceView; now: number }) {
  const { t } = useTranslation();
  const left = axisPercent(mark.atMs, view, now);
  const beyond = left === null;
  return (
    <span
      className={styles.banked}
      data-soon={mark.soon ? '1' : undefined}
      data-beyond={beyond ? '1' : undefined}
      style={{ left: `${left ?? 100}%` }}
      title={t('quota_management.pace_banked', {
        count: mark.count,
        at: formatInstantShort(mark.atMs),
      })}
    >
      <span className={styles.bankedGlyph} />
      <span className={styles.bankedLabel}>
        {mark.soon
          ? t('quota_management.pace_banked_soon', { count: mark.count })
          : `×${mark.count}`}
      </span>
    </span>
  );
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

function statusKey(status: PaceAccount['status'], view: PaceView): string {
  if (status === 'error') return 'quota_management.health_error';
  if (status === 'none') return `quota_management.pace_no_window_${view}`;
  return 'quota_management.pace_loading';
}

function readingTooltip(
  t: (key: string, options?: Record<string, unknown>) => string,
  reading: PaceReading
): string | undefined {
  const parts = [t('quota_management.percent_left', { percent: Math.round(reading.remaining) })];
  if (reading.timeLeft !== null) {
    parts.push(t('quota_management.pace_time_left', { percent: Math.round(reading.timeLeft) }));
  }
  if (reading.resetAtMs !== null) {
    parts.push(t('quota_management.pace_resets_at', { at: formatInstantShort(reading.resetAtMs) }));
  }
  return parts.join(' · ');
}
