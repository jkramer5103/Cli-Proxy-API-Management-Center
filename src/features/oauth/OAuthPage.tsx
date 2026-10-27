import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import iconVertex from '@/assets/icons/vertex.svg';
import iconCodex from '@/assets/icons/codex.svg';
import { ProviderTile } from './components/ProviderTile';
import { OAuthFlowDialog, type DialogHeading } from './components/OAuthFlowDialog';
import { VertexImportDialog } from './components/VertexImportDialog';
import { SiwcBindDialog } from './components/SiwcBindDialog';
import { useOAuthFlows, type ProviderFlowState } from './hooks/useOAuthFlows';
import { useVertexImport } from './hooks/useVertexImport';
import { OAUTH_PROVIDERS, supportsManualCallback, type OAuthProviderCard } from './providers';
import styles from './OAuthPage.module.scss';

/** 对话框焦点标识：Vertex 不是 OAuth 提供商，用保留 id 避免与提供商冲突。 */
const VERTEX_DIALOG_ID = '__vertex__';
const VERTEX_LABEL = 'Vertex AI';

type DialogTarget = { kind: 'oauth'; id: string } | { kind: 'vertex' };

/**
 * OAuth login: a tile per provider plus a focused authorization dialog. Closing the dialog
 * keeps the attempt running in the background; the tile caption shows live progress.
 */
export function OAuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const otherMethodsId = useId();

  const focusedRef = useRef<string | null>(null);
  const [dialog, setDialog] = useState<DialogTarget | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [siwcOpen, setSiwcOpen] = useState(false);
  // 每次打开换新 key 重新挂载（全新选择与会话）；关闭后保持挂载，让退出动画走完
  const [siwcKey, setSiwcKey] = useState(0);
  const openSiwc = () => {
    setSiwcKey((key) => key + 1);
    setSiwcOpen(true);
  };

  const flows = useOAuthFlows({
    isFocused: (provider) => focusedRef.current === provider,
  });
  const vertexImport = useVertexImport({
    isFocused: () => focusedRef.current === VERTEX_DIALOG_ID,
    onCredentialAdded: flows.recordCredentialAdded,
  });

  const labelOf = (card: OAuthProviderCard) =>
    typeof card.label === 'string' ? card.label : t(card.label.key);

  const captionOf = (card: OAuthProviderCard) => {
    const method = t(
      card.flow === 'device' ? 'auth_login.method_device' : 'auth_login.method_browser'
    );
    return card.domain ? `${card.domain} · ${method}` : method;
  };

  const headingOf = (card: OAuthProviderCard): DialogHeading => ({
    title: t(card.titleKey),
    caption: captionOf(card),
    icon: card.icon,
  });

  const tileStatusLabel = (status: ProviderFlowState['status']) =>
    status === 'waiting'
      ? t('auth_login.tile_waiting')
      : status === 'success'
        ? t('auth_login.tile_success')
        : status === 'error'
          ? t('auth_login.tile_error')
          : undefined;

  const openProvider = (card: OAuthProviderCard) => {
    focusedRef.current = card.id;
    setDialog({ kind: 'oauth', id: card.id });
    setDialogOpen(true);
    // 已有进行中/失败/刚成功的尝试 → 只是重新打开查看；否则立即开始登录
    if (!flows.states[card.id]?.status) void flows.startAuth(card.id);
  };

  const openVertex = () => {
    focusedRef.current = VERTEX_DIALOG_ID;
    setDialog({ kind: 'vertex' });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (dialog?.kind === 'oauth') flows.dismissSuccess(dialog.id);
    if (dialog?.kind === 'vertex' && vertexImport.vertex.result) vertexImport.resetForAnother();
    focusedRef.current = null;
    setDialogOpen(false);
  };

  const viewAuthFiles = () => navigate('/auth-files');

  const dialogCard =
    dialog?.kind === 'oauth' ? OAUTH_PROVIDERS.find((card) => card.id === dialog.id) : undefined;
  const renderTile = (card: OAuthProviderCard, index: number) => {
    const status = flows.states[card.id]?.status;
    return (
      <ProviderTile
        key={card.id}
        label={labelOf(card)}
        caption={captionOf(card)}
        icon={card.icon}
        index={index}
        status={status}
        statusLabel={tileStatusLabel(status)}
        onOpen={() => openProvider(card)}
      />
    );
  };
  const waitingCount = Object.values(flows.states).filter(
    (state) => state.status === 'waiting'
  ).length;

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('nav.oauth')}
        description={t('auth_login.page_description')}
        meta={
          (waitingCount > 0 || flows.addedCount > 0) && (
            <>
              {waitingCount > 0 && (
                <span>{t('auth_login.meta_waiting', { count: waitingCount })}</span>
              )}
              {flows.addedCount > 0 && (
                <span>{t('auth_login.meta_added', { count: flows.addedCount })}</span>
              )}
            </>
          )
        }
      />

      <div className={styles.grid}>{OAUTH_PROVIDERS.map(renderTile)}</div>

      <section className={styles.section} aria-labelledby={otherMethodsId}>
        <h2 className={styles.sectionLabel} id={otherMethodsId}>
          {t('auth_login.other_login_methods')}
        </h2>
        <div className={styles.grid}>
          <ProviderTile
            label={VERTEX_LABEL}
            caption={t('vertex_import.file_label')}
            icon={iconVertex}
            index={OAUTH_PROVIDERS.length}
            onOpen={openVertex}
          />
          <ProviderTile
            label={t('siwc.bind')}
            caption={t('siwc.tile_caption')}
            icon={iconCodex}
            index={OAUTH_PROVIDERS.length + 1}
            onOpen={openSiwc}
          />
        </div>
      </section>

      {dialogCard && (
        <OAuthFlowDialog
          open={dialogOpen && dialog?.kind === 'oauth'}
          providerId={dialogCard.id}
          heading={headingOf(dialogCard)}
          state={flows.states[dialogCard.id] ?? {}}
          text={(suffix) => flows.providerText(dialogCard.id, suffix)}
          supportsCallback={supportsManualCallback(dialogCard)}
          onStart={() => void flows.startAuth(dialogCard.id)}
          onCancel={() => void flows.cancelAuth(dialogCard.id)}
          onCallbackChange={(value) => flows.setCallbackInput(dialogCard.id, value)}
          onCallbackSubmit={() => void flows.submitCallback(dialogCard.id)}
          onViewAuthFiles={viewAuthFiles}
          onClose={closeDialog}
        />
      )}

      <VertexImportDialog
        open={dialogOpen && dialog?.kind === 'vertex'}
        heading={{
          title: t('vertex_import.title'),
          caption: t('vertex_import.file_label'),
          icon: iconVertex,
        }}
        vertex={vertexImport.vertex}
        onPickFile={vertexImport.pickFile}
        onLocationChange={vertexImport.setLocation}
        onImport={() => void vertexImport.importCredential()}
        onImportAnother={vertexImport.resetForAnother}
        onViewAuthFiles={viewAuthFiles}
        onClose={closeDialog}
      />

      {siwcKey > 0 && (
        <SiwcBindDialog
          key={siwcKey}
          open={siwcOpen}
          onClose={() => setSiwcOpen(false)}
          onViewAuthFiles={viewAuthFiles}
        />
      )}
    </div>
  );
}
