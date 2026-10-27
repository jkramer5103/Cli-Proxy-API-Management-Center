import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import { configApi, versionApi } from '@/services/api';
import { formatDateTimeValue } from '@/utils/format';
import styles from './SystemPage.module.scss';

const parseVersionSegments = (version?: string | null) => {
  if (!version) return null;
  const cleaned = version.trim().replace(/^v/i, '');
  if (!cleaned) return null;
  const parts = cleaned
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map((segment) => Number.parseInt(segment, 10))
    .filter(Number.isFinite);
  return parts.length ? parts : null;
};

const compareVersions = (latest?: string | null, current?: string | null) => {
  const latestParts = parseVersionSegments(latest);
  const currentParts = parseVersionSegments(current);
  if (!latestParts || !currentParts) return null;
  const length = Math.max(latestParts.length, currentParts.length);
  for (let i = 0; i < length; i++) {
    const l = latestParts[i] || 0;
    const c = currentParts[i] || 0;
    if (l > c) return 1;
    if (l < c) return -1;
  }
  return 0;
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : '';

export function SystemPage() {
  const { t, i18n } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const apiBase = useAuthStore((state) => state.apiBase);
  const serverVersion = useAuthStore((state) => state.serverVersion);
  const serverBuildDate = useAuthStore((state) => state.serverBuildDate);
  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const clearCache = useConfigStore((state) => state.clearCache);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);
  const [requestLogSaving, setRequestLogSaving] = useState(false);
  const [checkingVersion, setCheckingVersion] = useState(false);

  const unknown = t('system_info.version_unknown');
  const requestLogEnabled = config?.requestLog ?? false;
  const canEditRequestLog = connectionStatus === 'connected' && Boolean(config);

  useEffect(() => {
    fetchConfig().catch(() => {
      // Connection errors surface through the auth flow.
    });
  }, [fetchConfig]);

  const handleRequestLogChange = async (next: boolean) => {
    if (!canEditRequestLog) return;
    setRequestLogSaving(true);
    updateConfigValue('request-log', next);
    try {
      await configApi.updateRequestLog(next);
      clearCache('request-log');
      showNotification(t('notification.request_log_updated'), 'success');
    } catch (error: unknown) {
      const message = errorMessage(error);
      updateConfigValue('request-log', !next);
      showNotification(
        `${t('notification.update_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setRequestLogSaving(false);
    }
  };

  const handleVersionCheck = useCallback(async () => {
    setCheckingVersion(true);
    try {
      const data = await versionApi.checkLatest();
      const latestRaw = data?.['latest-version'] ?? data?.latest_version ?? data?.latest ?? '';
      const latest = typeof latestRaw === 'string' ? latestRaw : String(latestRaw ?? '');
      if (!latest) {
        showNotification(t('system_info.version_check_error'), 'error');
        return;
      }
      const comparison = compareVersions(latest, serverVersion);
      if (comparison === null) {
        showNotification(t('system_info.version_current_missing'), 'warning');
      } else if (comparison > 0) {
        showNotification(t('system_info.version_update_available', { version: latest }), 'warning');
      } else {
        showNotification(t('system_info.version_is_latest'), 'success');
      }
    } catch (error: unknown) {
      const message = errorMessage(error);
      showNotification(
        `${t('system_info.version_check_error')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setCheckingVersion(false);
    }
  }, [serverVersion, showNotification, t]);

  const rows: Array<{ label: string; value: string }> = [
    { label: t('footer.api_version'), value: serverVersion || unknown },
    {
      label: t('footer.build_date'),
      value: formatDateTimeValue(serverBuildDate, i18n.language) || unknown,
    },
    { label: t('footer.version'), value: __APP_VERSION__ || unknown },
    { label: t('connection.status'), value: t(`common.${connectionStatus}_status`) },
    { label: t('system_info.server_address'), value: apiBase || '-' },
  ];

  return (
    <div className={styles.container}>
      <PageHeader title={t('system_info.title')} />

      <Card
        title={t('system_info.about_title')}
        extra={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleVersionCheck()}
            loading={checkingVersion}
          >
            {t('system_info.version_check_button')}
          </Button>
        }
      >
        <dl className={styles.infoList}>
          {rows.map((row) => (
            <div key={row.label} className={styles.infoRow}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title={t('basic_settings.request_log_title')}>
        <div className={styles.settingRow}>
          <div className={styles.settingText}>
            <span>{t('basic_settings.request_log_enable')}</span>
            <p>{t('basic_settings.request_log_warning')}</p>
          </div>
          <ToggleSwitch
            ariaLabel={t('basic_settings.request_log_enable')}
            checked={requestLogEnabled}
            disabled={!canEditRequestLog || requestLogSaving}
            onChange={(value) => void handleRequestLogChange(value)}
          />
        </div>
      </Card>
    </div>
  );
}
