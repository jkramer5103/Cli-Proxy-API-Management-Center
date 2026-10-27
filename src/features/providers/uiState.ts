import { isRecord } from '@/utils/helpers';
import { PROVIDER_BRAND_ORDER } from './descriptors';
import type { ProviderBrand } from './types';

const PROVIDERS_UI_STATE_KEY = 'providersPage.uiState';
const DEFAULT_ACTIVE_BRAND: ProviderBrand = PROVIDER_BRAND_ORDER[0];
const PROVIDER_BRAND_SET = new Set<ProviderBrand>(PROVIDER_BRAND_ORDER);

export interface ProvidersWorkbenchUiState {
  activeBrand: ProviderBrand;
}

const isProviderBrand = (value: unknown): value is ProviderBrand =>
  typeof value === 'string' && PROVIDER_BRAND_SET.has(value as ProviderBrand);

export const readProvidersWorkbenchUiState = (): ProvidersWorkbenchUiState => {
  if (typeof window === 'undefined') return { activeBrand: DEFAULT_ACTIVE_BRAND };
  try {
    const raw = window.localStorage.getItem(PROVIDERS_UI_STATE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (isRecord(parsed) && isProviderBrand(parsed.activeBrand)) {
      return { activeBrand: parsed.activeBrand };
    }
  } catch {
    // ignore malformed storage
  }
  return { activeBrand: DEFAULT_ACTIVE_BRAND };
};

export const writeProvidersWorkbenchUiState = (state: ProvidersWorkbenchUiState) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PROVIDERS_UI_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage failures
  }
};
