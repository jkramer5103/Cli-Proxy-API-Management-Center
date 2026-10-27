import { useTranslation } from 'react-i18next';
import { Collapsible } from '@/components/ui/Collapsible';
import type { OpenAIProviderConfig } from '@/types';
import { maskApiKey } from '@/utils/format';
import type { ProviderResource } from '../types';
import styles from './forms/sharedForm.module.scss';

interface ResourceDetailViewProps {
  resource: ProviderResource;
}

export function ResourceDetailView({ resource }: ResourceDetailViewProps) {
  const { t } = useTranslation();

  const primary: Array<[string, string]> = [
    ['identifier', resource.identifier],
    ['baseUrl', resource.baseUrl ?? t('providersPage.status.notSet')],
    ['proxyUrl', resource.proxyUrl ?? t('providersPage.status.notSet')],
    ['prefix', resource.prefix ?? t('providersPage.status.none')],
    ['models', String(resource.modelCount)],
    ['headers', String(resource.headerCount)],
  ];

  const metadata: Array<[string, string]> = [
    ['authIndex', resource.authIndex ?? t('providersPage.status.notSet')],
    ['excludedModels', String(resource.excludedModelCount)],
    ['apiKeyEntries', String(resource.apiKeyEntryCount)],
  ];

  const openaiConfig =
    resource.brand === 'openaiCompatibility' ? (resource.raw as OpenAIProviderConfig) : null;
  const apiKeyEntries = openaiConfig?.apiKeyEntries ?? [];

  return (
    <div>
      <div className={styles.detailHeader}>
        <div className={styles.sectionTitle}>{resource.name ?? resource.identifier}</div>
      </div>

      <dl className={styles.dl}>
        {primary.map(([key, value]) => (
          <div key={key}>
            <dt className={styles.dt}>{t(`providersPage.detail.fields.${key}`)}</dt>
            <dd className={styles.dd}>{value}</dd>
          </div>
        ))}
      </dl>

      {openaiConfig && apiKeyEntries.length > 0 ? (
        <div className={styles.apiKeyEntriesSection}>
          <div className={styles.apiKeyEntriesLabel}>
            {t('providersPage.form.apiKeyEntriesSection')}: {apiKeyEntries.length}
          </div>
          <div className={styles.apiKeyEntryList}>
            {apiKeyEntries.map((entry, entryIndex) => (
              <div key={`${entry.apiKey}-${entryIndex}`} className={styles.apiKeyEntryCard}>
                <span className={styles.apiKeyEntryIndex}>{entryIndex + 1}</span>
                <span className={styles.apiKeyEntryKey}>{maskApiKey(entry.apiKey)}</span>
                {entry.proxyUrl ? (
                  <span className={styles.apiKeyEntryProxy}>{entry.proxyUrl}</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 16 }}>
        <Collapsible label={t('providersPage.detail.metadataTitle')}>
          <dl className={styles.dl}>
            {metadata.map(([key, value]) => (
              <div key={key}>
                <dt className={styles.dt}>{t(`providersPage.detail.fields.${key}`)}</dt>
                <dd className={styles.dd}>{value}</dd>
              </div>
            ))}
          </dl>
        </Collapsible>
      </div>
    </div>
  );
}
