const DISABLE_ALL_MODELS_RULE = '*';
const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';

export const hasDisableAllModelsRule = (models?: string[]) =>
  Array.isArray(models) &&
  models.some((model) => String(model ?? '').trim() === DISABLE_ALL_MODELS_RULE);

export const stripDisableAllModelsRule = (models?: string[]) =>
  Array.isArray(models)
    ? models.filter((model) => String(model ?? '').trim() !== DISABLE_ALL_MODELS_RULE)
    : [];

export const withDisableAllModelsRule = (models?: string[]) => {
  const base = stripDisableAllModelsRule(models);
  return [...base, DISABLE_ALL_MODELS_RULE];
};

export const withoutDisableAllModelsRule = (models?: string[]) => stripDisableAllModelsRule(models);

const normalizeUpstreamBaseUrl = (baseUrl: string, fallback = ''): string => {
  let trimmed = String(baseUrl || '').trim();
  if (!trimmed) return fallback;
  trimmed = trimmed.replace(/\/?v0\/management\/?$/i, '');
  trimmed = trimmed.replace(/\/+$/g, '');
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed}`;
  }
  return trimmed;
};

const buildGeminiModelResource = (model: string): string => {
  const trimmed = String(model || '')
    .trim()
    .replace(/^\/+/g, '')
    .replace(/:generateContent$/i, '');
  if (!trimmed) return '';

  if (/^(models|tunedModels)\//i.test(trimmed)) {
    return trimmed.split('/').map(encodeURIComponent).join('/');
  }

  return `models/${encodeURIComponent(trimmed)}`;
};

export const buildOpenAIChatCompletionsEndpoint = (baseUrl: string): string => {
  const trimmed = normalizeUpstreamBaseUrl(baseUrl);
  if (!trimmed) return '';
  if (trimmed.endsWith('/chat/completions')) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
};

export const buildCodexResponsesEndpoint = (baseUrl: string): string => {
  const trimmed = normalizeUpstreamBaseUrl(baseUrl);
  if (!trimmed) return '';
  if (/\/v1\/responses$/i.test(trimmed)) {
    return trimmed;
  }
  if (/\/v1\/models$/i.test(trimmed)) {
    return trimmed.replace(/\/models$/i, '/responses');
  }
  if (/\/v1$/i.test(trimmed)) {
    return `${trimmed}/responses`;
  }
  return `${trimmed}/v1/responses`;
};

export const buildClaudeMessagesEndpoint = (baseUrl: string): string => {
  const trimmed = normalizeUpstreamBaseUrl(baseUrl, 'https://api.anthropic.com');
  if (!trimmed) return '';
  if (trimmed.endsWith('/v1/messages')) {
    return trimmed;
  }
  if (trimmed.endsWith('/v1')) {
    return `${trimmed}/messages`;
  }
  return `${trimmed}/v1/messages`;
};

export const INTERACTIONS_API_REVISION = '2026-05-20';

export const buildInteractionsProbePayload = (model: string) => ({
  model,
  input: 'Hi',
});

export const buildInteractionsEndpoint = (baseUrl: string): string => {
  const trimmed = normalizeUpstreamBaseUrl(baseUrl, DEFAULT_GEMINI_BASE_URL);
  if (!trimmed) return '';
  if (/\/v1beta\/interactions$/i.test(trimmed)) {
    return trimmed;
  }

  let root = trimmed.replace(/\/+$/g, '');
  root = root.replace(/\/v1beta\/models$/i, '');
  if (/\/v1beta$/i.test(root)) {
    return `${root}/interactions`;
  }
  root = root.replace(/\/v1beta(?:\/.*)?$/i, '');
  return `${root}/v1beta/interactions`;
};

export const buildGeminiGenerateContentEndpoint = (baseUrl: string, model: string): string => {
  const resource = buildGeminiModelResource(model);
  if (!resource) return '';

  const trimmed = normalizeUpstreamBaseUrl(baseUrl, DEFAULT_GEMINI_BASE_URL);
  if (!trimmed) return '';
  if (/:generateContent$/i.test(trimmed)) {
    return trimmed;
  }

  let root = trimmed.replace(/\/+$/g, '');
  if (/\/v1beta\/models$/i.test(root)) {
    root = root.replace(/\/models$/i, '');
  } else if (!/\/v1beta$/i.test(root)) {
    root = root.replace(/\/v1beta(?:\/.*)?$/i, '');
    root = `${root}/v1beta`;
  }

  return `${root}/${resource}:generateContent`;
};
