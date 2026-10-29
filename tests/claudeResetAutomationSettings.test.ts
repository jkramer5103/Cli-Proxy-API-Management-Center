import { afterEach, describe, expect, test } from 'bun:test';
import { normalizeConfigResponse } from '../src/services/api/transformers';
import { useConfigStore } from '../src/stores/useConfigStore';
import { apiClient } from '../src/services/api/client';
import { configApi } from '../src/services/api/config';

const originalCapture = apiClient.captureConnection;
afterEach(() => {
  apiClient.captureConnection = originalCapture;
  useConfigStore.getState().clearCache();
});

describe('Claude banked-reset automation config', () => {
  test('distinguishes default-off support from absent or malformed capability', () => {
    for (const enabled of [false, true]) {
      expect(
        normalizeConfigResponse({ upstream: { claude: { 'auto-apply-banked-resets': enabled } } })
          .claudeAutoApplyBankedResets
      ).toBe(enabled);
    }
    for (const value of [undefined, null, 'true', 'false', 0, 1]) {
      expect(
        normalizeConfigResponse({ upstream: { claude: { 'auto-apply-banked-resets': value } } })
          .claudeAutoApplyBankedResets
      ).toBeUndefined();
    }
    expect(normalizeConfigResponse({}).claudeAutoApplyBankedResets).toBeUndefined();
  });

  test('saves a bare boolean through a captured v8 config connection', async () => {
    const calls: unknown[][] = [];
    const captured = apiClient.captureConnection();
    captured.put = (async (...args: unknown[]) => {
      calls.push(args);
      return { status: 'ok' };
    }) as typeof captured.put;
    apiClient.captureConnection = () => captured;
    await configApi.updateClaudeAutoApplyBankedResets(true);
    await configApi.updateClaudeAutoApplyBankedResets(false);
    expect(calls).toEqual([
      ['/config/upstream/claude/auto-apply-banked-resets', true],
      ['/config/upstream/claude/auto-apply-banked-resets', false],
    ]);
  });

  test('setting updates invalidate cached config and preserve unrelated settings', () => {
    const raw = { upstream: { claude: { 'auto-apply-banked-resets': false } } };
    useConfigStore.setState({
      config: { raw, requestLog: true, claudeAutoApplyBankedResets: false },
    });
    useConfigStore.getState().updateConfigValue('claude-auto-apply-banked-resets', true);
    expect(useConfigStore.getState().config).toEqual({
      raw,
      requestLog: true,
      claudeAutoApplyBankedResets: true,
    });
    expect(useConfigStore.getState().isCacheValid()).toBe(false);
  });
});
