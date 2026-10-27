import { useTranslation } from 'react-i18next';
import { IconEye, IconPencil, IconTrash2 } from '@/components/ui/icons';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import type { ProviderResource } from '../types';
import styles from './ProviderResourceTable.module.scss';

interface ProviderResourceTableProps {
  resources: ProviderResource[];
  selectedId?: string | null;
  disableMutations?: boolean;
  onView: (resource: ProviderResource) => void;
  onEdit: (resource: ProviderResource) => void;
  onDelete: (resource: ProviderResource) => void;
  onToggleDisabled?: (resource: ProviderResource, disabled: boolean) => void;
}

const columnWidths = ['200px', 'auto', '80px', '136px', '116px'];

export function ProviderResourceTable({
  resources,
  selectedId,
  disableMutations,
  onView,
  onEdit,
  onDelete,
  onToggleDisabled,
}: ProviderResourceTableProps) {
  const { t } = useTranslation();

  const renderPrimary = (r: ProviderResource) => {
    if (r.brand === 'openaiCompatibility') {
      const extra = r.apiKeyEntryCount > 1 ? ` · +${r.apiKeyEntryCount - 1}` : '';
      return (
        <div className={styles.primaryCell}>
          <span className={styles.primaryName}>{r.name ?? r.identifier}</span>
          <span className={styles.primarySub}>{(r.apiKeyPreview ?? '—') + extra}</span>
        </div>
      );
    }
    return (
      <div className={styles.primaryCell}>
        {r.name ? <span className={styles.primaryName}>{r.name}</span> : null}
        <span className={r.name ? styles.primarySub : styles.primaryKey}>
          {r.apiKeyPreview ?? '—'}
        </span>
      </div>
    );
  };

  const renderBaseUrl = (r: ProviderResource) => {
    if (r.brand === 'claude' && !r.baseUrl) {
      return (
        <span className={styles.baseUrl}>
          https://api.anthropic.com {t('providersPage.status.defaultSuffix')}
        </span>
      );
    }
    return (
      <span className={styles.baseUrl} title={r.baseUrl ?? undefined}>
        {r.baseUrl ?? t('providersPage.status.notSet')}
      </span>
    );
  };

  return (
    <Table
      className={styles.providerTable}
      cols={columnWidths.map((w, i) => (
        <col key={i} style={w === 'auto' ? undefined : { width: w }} />
      ))}
    >
      <TableHeader>
        <TableRow>
          <TableHead>{t('providersPage.table.key')}</TableHead>
          <TableHead>{t('providersPage.table.baseUrl')}</TableHead>
          <TableHead>{t('providersPage.table.models')}</TableHead>
          <TableHead>{t('providersPage.table.status')}</TableHead>
          <TableHead alignRight>{t('providersPage.table.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {resources.map((resource) => (
          <TableRow
            key={resource.id}
            selected={resource.id === selectedId}
            className={styles.row}
            onClick={() => onView(resource)}
          >
            <TableCell>{renderPrimary(resource)}</TableCell>
            <TableCell>{renderBaseUrl(resource)}</TableCell>
            <TableCell>
              <span className={styles.count}>{resource.modelCount}</span>
            </TableCell>
            <TableCell>
              <span className={styles.statusCell} onClick={(e) => e.stopPropagation()}>
                {onToggleDisabled ? (
                  <ToggleSwitch
                    checked={!resource.disabled}
                    disabled={disableMutations}
                    onChange={(value) => onToggleDisabled(resource, !value)}
                    ariaLabel={
                      resource.disabled
                        ? t('providersPage.actions.enable')
                        : t('providersPage.actions.disable')
                    }
                  />
                ) : null}
                <span className={resource.disabled ? styles.statusOff : styles.statusOn}>
                  {resource.disabled
                    ? t('providersPage.status.disabled')
                    : t('providersPage.status.active')}
                </span>
              </span>
            </TableCell>
            <TableCell alignRight>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label={t('providersPage.actions.view')}
                  title={t('providersPage.actions.view')}
                  onClick={(e) => {
                    e.stopPropagation();
                    onView(resource);
                  }}
                >
                  <IconEye size={16} />
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label={t('providersPage.actions.edit')}
                  title={t('providersPage.actions.edit')}
                  disabled={disableMutations}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(resource);
                  }}
                >
                  <IconPencil size={16} />
                </button>
                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                  aria-label={t('providersPage.actions.delete')}
                  title={t('providersPage.actions.delete')}
                  disabled={disableMutations}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(resource);
                  }}
                >
                  <IconTrash2 size={16} />
                </button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
