/**
 * 模型工具函数
 * 迁移自基线 utils/models.js
 */

import { isRecord } from './helpers';

export interface ModelInfo {
  name: string;
  alias?: string;
  description?: string;
}

export function normalizeModelList(payload: unknown, { dedupe = false } = {}): ModelInfo[] {
  const toModel = (entry: unknown): ModelInfo | null => {
    if (typeof entry === 'string') {
      return { name: entry };
    }
    if (!isRecord(entry)) {
      return null;
    }
    const name = entry.id || entry.name || entry.model || entry.value;
    if (!name) return null;

    const alias = entry.alias || entry.display_name || entry.displayName;
    const description = entry.description || entry.note || entry.comment;
    const model: ModelInfo = { name: String(name) };
    if (alias && alias !== name) {
      model.alias = String(alias);
    }
    if (description) {
      model.description = String(description);
    }
    return model;
  };

  let models: (ModelInfo | null)[] = [];

  if (Array.isArray(payload)) {
    models = payload.map(toModel);
  } else if (isRecord(payload)) {
    if (Array.isArray(payload.data)) {
      models = payload.data.map(toModel);
    } else if (Array.isArray(payload.models)) {
      models = payload.models.map(toModel);
    }
  }

  const normalized = models.filter(Boolean) as ModelInfo[];
  if (!dedupe) {
    return normalized;
  }

  const seen = new Set<string>();
  return normalized.filter((model) => {
    const key = (model?.name || '').toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
