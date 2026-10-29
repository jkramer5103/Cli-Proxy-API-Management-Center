import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { configApi } from '@/services/api/config';
import { apiClient } from '@/services/api/client';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import styles from './ClaudeResetAutomationSettings.module.scss';

export function ClaudeResetAutomationSettings() {
  const { t } = useTranslation();
  const enabled = useConfigStore((state) => state.config?.claudeAutoApplyBankedResets);
  const connected = useAuthStore((state) => state.connectionStatus === 'connected');
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const supported = enabled !== undefined;

  const change = async (next: boolean) => {
    if (lock.current || !connected || !supported) return;
    lock.current = true;
    setSaving(true);
    const revision = apiClient.getConnectionRevision();
    const current = () => revision === apiClient.getConnectionRevision();
    try {
      await configApi.updateClaudeAutoApplyBankedResets(next);
      if (!current()) return;
      useConfigStore.getState().updateConfigValue('claude-auto-apply-banked-resets', next);
      useNotificationStore.getState().showNotification(t('claude_reset.auto_saved'), 'success');
    } catch {
      if (current()) {
        useNotificationStore
          .getState()
          .showNotification(t('claude_reset.auto_save_error'), 'error');
      }
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };

  return (
    <Card title={t('claude_reset.auto_title')}>
      <div className={styles.row}>
        <div className={styles.text}>
          <span>{t('claude_reset.auto_enable')}</span>
          <p id="claude-reset-auto-description">{t('claude_reset.auto_description')}</p>
          {!supported && <p role="status">{t('claude_reset.auto_unsupported')}</p>}
        </div>
        <ToggleSwitch
          checked={enabled === true}
          disabled={!connected || !supported || saving}
          ariaLabel={t('claude_reset.auto_enable')}
          ariaDescribedBy="claude-reset-auto-description"
          onChange={(next) => void change(next)}
        />
      </div>
    </Card>
  );
}
