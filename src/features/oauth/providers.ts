import type { BuiltInOAuthProvider } from '@/services/api';
import iconMeta from '@/assets/icons/meta.svg';
import iconCodex from '@/assets/icons/codex.svg';
import iconClaude from '@/assets/icons/claude.svg';
import iconAntigravity from '@/assets/icons/antigravity.svg';
import iconKimi from '@/assets/icons/kimi-tile-white.svg';
import iconGrok from '@/assets/icons/grok-dark.svg';
import iconDevin from '@/assets/icons/devin-dark.svg';

/** Device-code flows return a user_code; browser flows rely on a callback (local or pasted). */
export type OAuthFlowKind = 'device' | 'browser';

export interface OAuthProviderCard {
  id: BuiltInOAuthProvider;
  /** Tile label: brand names are constants, regional sites go through i18n. */
  label: string | { key: string };
  /** Dialog title, `auth_login.<id>_oauth_title`. */
  titleKey: string;
  icon: string;
  flow: OAuthFlowKind;
  /** Distinguishes regional sites of the same brand. */
  domain?: string;
}

/** Display order is array order. */
export const OAUTH_PROVIDERS: OAuthProviderCard[] = [
  {
    id: 'anthropic',
    label: 'Claude',
    titleKey: 'auth_login.anthropic_oauth_title',
    icon: iconClaude,
    flow: 'browser',
  },
  {
    id: 'codex',
    label: 'Codex',
    titleKey: 'auth_login.codex_oauth_title',
    icon: iconCodex,
    flow: 'browser',
  },
  {
    id: 'antigravity',
    label: 'Antigravity',
    titleKey: 'auth_login.antigravity_oauth_title',
    icon: iconAntigravity,
    flow: 'browser',
  },
  {
    id: 'xai',
    label: 'xAI',
    titleKey: 'auth_login.xai_oauth_title',
    icon: iconGrok,
    flow: 'browser',
  },
  {
    id: 'kimi',
    label: { key: 'auth_login.kimi_oauth_name' },
    titleKey: 'auth_login.kimi_oauth_title',
    icon: iconKimi,
    flow: 'device',
    domain: 'kimi.com',
  },
  {
    id: 'kimi-ai',
    label: { key: 'auth_login.kimi_ai_oauth_name' },
    titleKey: 'auth_login.kimi_ai_oauth_title',
    icon: iconKimi,
    flow: 'device',
    domain: 'kimi.ai',
  },
  {
    id: 'meta',
    label: 'Muse (Meta)',
    titleKey: 'auth_login.meta_oauth_title',
    icon: iconMeta,
    flow: 'device',
  },
  {
    id: 'devin',
    label: 'Devin',
    titleKey: 'auth_login.devin_oauth_title',
    icon: iconDevin,
    flow: 'browser',
  },
];

/** Providers whose backend accepts a manually pasted callback URL. */
export const CALLBACK_SUPPORTED = new Set<string>([
  'codex',
  'anthropic',
  'antigravity',
  'xai',
  'devin',
]);

export const supportsManualCallback = (provider: OAuthProviderCard): boolean =>
  CALLBACK_SUPPORTED.has(provider.id);
