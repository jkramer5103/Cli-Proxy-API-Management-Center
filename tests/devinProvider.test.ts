import { describe, expect, test } from 'bun:test';
import {
  getAuthFileIcon,
  OAUTH_PROVIDER_PRESETS,
  supportsAuthFileManualRefresh,
} from '@/features/authFiles/constants';
import { PROVIDER_LOGOS } from '@/features/providers/brandLogos';
import { normalizeAuthFilesResponse } from '@/services/api/authFiles';
import type { AuthFileItem, AuthFileType } from '@/types/authFile';
import { TYPE_COLORS } from '@/utils/quota/constants';

describe('Devin provider recognition', () => {
  test('registers Devin auth files without enabling manual refresh', () => {
    const type: AuthFileType = 'devin';
    const file: AuthFileItem = { name: 'devin-user.json', type };

    expect(file.type).toBe('devin');
    expect(OAUTH_PROVIDER_PRESETS).toContain('devin');
    expect(supportsAuthFileManualRefresh('devin')).toBe(false);
  });

  test('provides a dark-surface logo asset plus quota colors', () => {
    const icon = getAuthFileIcon('devin');

    expect(icon).toBeTruthy();
    expect(PROVIDER_LOGOS.devin.darkSrc).toBe(icon);
    expect(TYPE_COLORS.devin.light).toBeDefined();
    expect(TYPE_COLORS.devin.dark).toBeDefined();
  });

  test('preserves minimal Devin credentials and unknown fields during normalization', () => {
    const credential = {
      name: 'devin-user.json',
      type: 'devin',
      api_key: 'redacted-api-key',
      session_token: 'redacted-session-token',
      proxy_url: 'http://proxy.example',
      future_field: { enabled: true },
    };

    const [normalized] = normalizeAuthFilesResponse({ files: [credential] }, 1).files;

    expect(normalized).toMatchObject(credential);
  });
});
