import { db } from '../db/index.js';
import { config } from '../config.js';
import { badRequest } from '../lib/errors.js';
import {
  AI_MODELS,
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  coerceEffort,
  findModel,
  type ReasoningEffort,
} from '../lib/ai-models.js';

const readSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const writeSetting = db.prepare(
  `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
);
const clearSetting = db.prepare('DELETE FROM settings WHERE key = ?');

const KEYS = {
  apiKey: 'ai.apiKey',
  model: 'ai.model',
  effort: 'ai.reasoningEffort',
  autoRun: 'ai.autoRun',
  createCollections: 'ai.createCollections',
} as const;

function get(key: string): string | null {
  return (readSetting.get(key) as { value: string } | undefined)?.value ?? null;
}

function getBool(key: string, fallback: boolean): boolean {
  const raw = get(key);
  return raw === null ? fallback : raw === '1';
}

export interface AiConfig {
  apiKey: string | null;
  keySource: 'env' | 'settings' | 'none';
  model: string;
  reasoningEffort: ReasoningEffort;
  autoRun: boolean;
  createCollections: boolean;
}

/**
 * The environment wins over the stored key, so an operator who sets one in
 * compose cannot have it silently replaced from the browser.
 */
export function readAiConfig(): AiConfig {
  const envKey = config.openai.apiKey;
  const storedKey = get(KEYS.apiKey);
  const apiKey = envKey || storedKey || null;

  const modelId = get(KEYS.model) ?? DEFAULT_MODEL;
  const model = findModel(modelId) ?? findModel(DEFAULT_MODEL)!;

  return {
    apiKey,
    keySource: envKey ? 'env' : storedKey ? 'settings' : 'none',
    model: model.id,
    reasoningEffort: coerceEffort(model, get(KEYS.effort) ?? DEFAULT_EFFORT),
    autoRun: getBool(KEYS.autoRun, true),
    createCollections: getBool(KEYS.createCollections, true),
  };
}

/** The single gate the rest of the app checks. No key, no feature. */
export function isAiConfigured(): boolean {
  return readAiConfig().apiKey !== null;
}

/** Enough of the key to recognise it, never enough to use it. */
function hint(apiKey: string | null): string | null {
  if (!apiKey) return null;
  return apiKey.length <= 12 ? '••••' : `${apiKey.slice(0, 6)}…${apiKey.slice(-4)}`;
}

export interface AiSettingsPublic {
  configured: boolean;
  keySource: AiConfig['keySource'];
  keyHint: string | null;
  model: string;
  reasoningEffort: ReasoningEffort;
  autoRun: boolean;
  createCollections: boolean;
  models: Array<{ id: string; note: string; efforts: ReasoningEffort[] }>;
}

export function publicAiSettings(): AiSettingsPublic {
  const ai = readAiConfig();
  return {
    configured: ai.apiKey !== null,
    keySource: ai.keySource,
    keyHint: hint(ai.apiKey),
    model: ai.model,
    reasoningEffort: ai.reasoningEffort,
    autoRun: ai.autoRun,
    createCollections: ai.createCollections,
    models: AI_MODELS,
  };
}

export interface AiSettingsInput {
  /** An empty string clears the stored key. Undefined leaves it alone. */
  apiKey?: string;
  model?: string;
  reasoningEffort?: string;
  autoRun?: boolean;
  createCollections?: boolean;
}

export function updateAiSettings(input: AiSettingsInput): AiSettingsPublic {
  if (input.model !== undefined && !findModel(input.model)) {
    throw badRequest(`Pocket does not know the model "${input.model}".`);
  }

  db.transaction(() => {
    if (input.apiKey !== undefined) {
      const key = input.apiKey.trim();
      if (key) writeSetting.run(KEYS.apiKey, key);
      else clearSetting.run(KEYS.apiKey);
    }
    if (input.model !== undefined) writeSetting.run(KEYS.model, input.model);
    if (input.reasoningEffort !== undefined) writeSetting.run(KEYS.effort, input.reasoningEffort);
    if (input.autoRun !== undefined) writeSetting.run(KEYS.autoRun, input.autoRun ? '1' : '0');
    if (input.createCollections !== undefined) {
      writeSetting.run(KEYS.createCollections, input.createCollections ? '1' : '0');
    }
  })();

  return publicAiSettings();
}
