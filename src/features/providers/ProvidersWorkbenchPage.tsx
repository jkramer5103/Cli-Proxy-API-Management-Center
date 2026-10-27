import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { IconPlus, IconRefreshCw } from '@/components/ui/icons';
import { useAuthStore, useNotificationStore } from '@/stores';
import { ProviderCategoryList } from './components/ProviderCategoryList';
import { ProviderResourcePanel } from './components/ProviderResourcePanel';
import { ProviderSheet, type ProviderSheetHandle } from './sheets/ProviderSheet';
import { useProviderWorkbench } from './useProviderWorkbench';
import {
  readProvidersWorkbenchUiState,
  writeProvidersWorkbenchUiState,
  type ProvidersWorkbenchUiState,
} from './uiState';
import type { ProviderBrand, ProviderResource } from './types';
import styles from './ProvidersWorkbenchPage.module.scss';

type SheetMode = 'detail' | 'create' | 'edit';

interface SheetState {
  open: boolean;
  brand: ProviderBrand;
  mode: SheetMode;
  resource: ProviderResource | null;
}

const matchesFilter = (r: ProviderResource, normalized: string): boolean => {
  if (!normalized) return true;
  return [r.identifier, r.name, r.authIndex, r.apiKeyPreview, r.apiKey, r.baseUrl, r.prefix]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(normalized));
};

export function ProvidersWorkbenchPage() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((s) => s.connectionStatus);
  const { showNotification, showConfirmation } = useNotificationStore();

  const workbench = useProviderWorkbench();
  const [uiState, setUiState] = useState<ProvidersWorkbenchUiState>(readProvidersWorkbenchUiState);
  // Search is per-session and per-provider; it is intentionally not persisted.
  const [filters, setFilters] = useState<Partial<Record<ProviderBrand, string>>>({});
  const [sheetState, setSheetState] = useState<SheetState>({
    open: false,
    brand: 'claude',
    mode: 'detail',
    resource: null,
  });
  const sheetRef = useRef<ProviderSheetHandle>(null);

  const disableMutations =
    connectionStatus !== 'connected' ||
    workbench.mutating ||
    workbench.isFetching ||
    workbench.isError;

  const setActiveBrand = useCallback((brand: ProviderBrand) => {
    setUiState((prev) => {
      if (prev.activeBrand === brand) return prev;
      const next = { ...prev, activeBrand: brand };
      writeProvidersWorkbenchUiState(next);
      return next;
    });
  }, []);

  const groups = useMemo(() => workbench.snapshot?.groups ?? [], [workbench.snapshot]);
  const activeGroup = groups.find((g) => g.id === uiState.activeBrand) ?? groups[0] ?? null;
  const activeBrand = activeGroup?.id ?? uiState.activeBrand;
  const filter = filters[activeBrand] ?? '';

  const visibleResources = useMemo(() => {
    if (!activeGroup) return [];
    const normalized = filter.trim().toLowerCase();
    return activeGroup.resources.filter((r) => matchesFilter(r, normalized));
  }, [activeGroup, filter]);

  const totalResources = groups.reduce((sum, g) => sum + g.resources.length, 0);
  const totalActive = groups.reduce(
    (sum, g) => sum + g.resources.filter((r) => !r.disabled).length,
    0
  );

  const openCreate = useCallback(() => {
    setSheetState({ open: true, brand: activeBrand, mode: 'create', resource: null });
  }, [activeBrand]);

  const openView = useCallback((resource: ProviderResource) => {
    setSheetState({ open: true, brand: resource.brand, mode: 'detail', resource });
  }, []);

  const openEdit = useCallback((resource: ProviderResource) => {
    setSheetState({ open: true, brand: resource.brand, mode: 'edit', resource });
  }, []);

  const closeSheet = useCallback(() => {
    setSheetState((s) => ({ ...s, open: false }));
  }, []);

  const handleDelete = useCallback(
    (resource: ProviderResource) => {
      const name = resource.name ?? resource.apiKeyPreview ?? resource.identifier ?? '';
      showConfirmation({
        title: t('providersPage.delete.title'),
        message: t('providersPage.delete.confirm', { name }),
        variant: 'danger',
        confirmText: t('providersPage.actions.delete'),
        onConfirm: async () => {
          try {
            await workbench.deleteProvider(resource);
            showNotification(t('providersPage.toast.deleted'), 'success');
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            showNotification(`${t('notification.delete_failed')}: ${msg}`, 'error');
          }
        },
      });
    },
    [showConfirmation, showNotification, t, workbench]
  );

  const handleToggleDisabled = useCallback(
    async (resource: ProviderResource, disabled: boolean) => {
      try {
        await workbench.toggleDisabled(resource, disabled);
        showNotification(
          disabled ? t('providersPage.toast.disabled') : t('providersPage.toast.enabled'),
          'success'
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showNotification(`${t('providersPage.toast.toggleFailed')}: ${msg}`, 'error');
      }
    },
    [showNotification, t, workbench]
  );

  const handleCreated = useCallback(() => {
    showNotification(t('providersPage.toast.created'), 'success');
    closeSheet();
  }, [closeSheet, showNotification, t]);

  const handleUpdated = useCallback(() => {
    showNotification(t('providersPage.toast.updated'), 'success');
    closeSheet();
  }, [closeSheet, showNotification, t]);

  const selectBrand = (brand: ProviderBrand) => {
    const isSwitching = sheetState.open && sheetState.brand !== brand;
    const proceed =
      isSwitching && sheetRef.current
        ? sheetRef.current.confirmDiscardIfDirty()
        : Promise.resolve(true);
    void proceed.then((ok) => {
      if (!ok) return;
      setActiveBrand(brand);
      if (isSwitching) closeSheet();
    });
  };

  const header = (
    <PageHeader
      title={t('nav.providers')}
      meta={
        workbench.snapshot ? (
          <span>
            {t('providersPage.header.summary', { active: totalActive, total: totalResources })}
          </span>
        ) : null
      }
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void workbench.refetch()}
            loading={workbench.isFetching}
          >
            {!workbench.isFetching && <IconRefreshCw size={14} />}
            {t('common.refresh')}
          </Button>
          <Button size="sm" onClick={openCreate} disabled={disableMutations || !activeGroup}>
            <IconPlus size={14} />
            {t('providersPage.actions.new')}
          </Button>
        </>
      }
    />
  );

  const errorBanner = workbench.errorMessage ? (
    <div className="error-box">{workbench.errorMessage}</div>
  ) : null;

  if (!workbench.snapshot && workbench.isPending) {
    return (
      <div className={styles.page}>
        {header}
        <div className={styles.layout}>
          <Skeleton height={320} />
          <Skeleton height={320} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {header}
      {errorBanner}

      {activeGroup ? (
        <div className={styles.layout}>
          <ProviderCategoryList
            groups={groups}
            activeBrand={activeGroup.id}
            onSelect={selectBrand}
          />
          <ProviderResourcePanel
            group={activeGroup}
            filter={filter}
            onFilterChange={(value) => setFilters((prev) => ({ ...prev, [activeBrand]: value }))}
            filteredResources={visibleResources}
            selectedId={sheetState.open ? (sheetState.resource?.id ?? null) : null}
            disableMutations={disableMutations}
            onView={openView}
            onEdit={openEdit}
            onDelete={handleDelete}
            onToggleDisabled={handleToggleDisabled}
            onCreate={openCreate}
          />
        </div>
      ) : null}

      <ProviderSheet
        ref={sheetRef}
        state={sheetState}
        onClose={closeSheet}
        onSwitchToEdit={() => {
          setSheetState((s) => (s.resource ? { ...s, mode: 'edit' } : s));
        }}
        workbench={workbench}
        onCreated={handleCreated}
        onUpdated={handleUpdated}
        mutationDisabled={disableMutations}
      />
    </div>
  );
}
