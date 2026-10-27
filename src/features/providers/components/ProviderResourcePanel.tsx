import { useTranslation } from 'react-i18next';
import { IconPlus, IconSearch } from '@/components/ui/icons';
import { PROVIDER_LOGOS } from '../brandLogos';
import type { ProviderGroup, ProviderResource } from '../types';
import { ProviderResourceTable } from './ProviderResourceTable';
import styles from './ProviderResourcePanel.module.scss';

interface ProviderResourcePanelProps {
  group: ProviderGroup;
  filter: string;
  onFilterChange: (value: string) => void;
  filteredResources: ProviderResource[];
  selectedId: string | null;
  disableMutations?: boolean;
  onView: (resource: ProviderResource) => void;
  onEdit: (resource: ProviderResource) => void;
  onDelete: (resource: ProviderResource) => void;
  onToggleDisabled?: (resource: ProviderResource, disabled: boolean) => void;
  onCreate: () => void;
}

export function ProviderResourcePanel({
  group,
  filter,
  onFilterChange,
  filteredResources,
  selectedId,
  disableMutations,
  onView,
  onEdit,
  onDelete,
  onToggleDisabled,
  onCreate,
}: ProviderResourcePanelProps) {
  const { t } = useTranslation();
  const logo = PROVIDER_LOGOS[group.id];
  const providerTitle = t(`providersPage.providerNames.${group.id}`);

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          {logo ? (
            <img src={logo.darkSrc ?? logo.src} alt="" aria-hidden="true" className={styles.logo} />
          ) : null}
          <h2 className={styles.title}>{providerTitle}</h2>
        </div>
        {group.resources.length > 0 ? (
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon} aria-hidden="true">
              <IconSearch size={16} />
            </span>
            <input
              type="search"
              className={styles.searchInput}
              value={filter}
              onChange={(event) => onFilterChange(event.target.value)}
              placeholder={t('providersPage.table.filterPlaceholder')}
              aria-label={t('providersPage.table.filterPlaceholder')}
            />
          </div>
        ) : null}
      </div>

      {filteredResources.length === 0 ? (
        <div className={styles.empty}>
          <div>{t('providersPage.table.empty')}</div>
          {group.resources.length === 0 ? (
            <button
              type="button"
              className={styles.emptyActionButton}
              onClick={onCreate}
              disabled={disableMutations}
            >
              <IconPlus size={16} />
              <span>{t('providersPage.actions.new')}</span>
            </button>
          ) : null}
        </div>
      ) : (
        <ProviderResourceTable
          resources={filteredResources}
          selectedId={selectedId}
          disableMutations={disableMutations}
          onView={onView}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleDisabled={onToggleDisabled}
        />
      )}
    </section>
  );
}
