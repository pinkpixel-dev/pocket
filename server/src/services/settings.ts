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

const readSetting = db.prepare('SELECT value FROM settings WHERE user_id = ? AND key = ?');
const writeSetting = db.prepare(
  `INSERT INTO settings (user_id, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
);
const clearSetting = db.prepare('DELETE FROM settings WHERE user_id = ? AND key = ?');

const KEYS = {
  apiKey: 'ai.apiKey',
  model: 'ai.model',
  effort: 'ai.reasoningEffort',
  autoRun: 'ai.autoRun',
  createCollections: 'ai.createCollections',
} as const;

function get(userId: number, key: string): string | null {
  return (readSetting.get(userId, key) as { value: string } | undefined)?.value ?? null;
}

function getBool(userId: number, key: string, fallback: boolean): boolean {
  const raw = get(userId, key);
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
 * `POCKET_OPENAI_API_KEY` is the house key: every account can use it without
 * pasting anything. A key someone saves in their own Settings wins over it, so
 * one person on the NAS can spend on their own account instead of the
 * operator's. Everything else here has always been per-account by definition.
 */
export function readAiConfig(userId: number): AiConfig {
  const envKey = config.openai.apiKey;
  const storedKey = get(userId, KEYS.apiKey);
  const apiKey = storedKey || envKey || null;

  const modelId = get(userId, KEYS.model) ?? DEFAULT_MODEL;
  const model = findModel(modelId) ?? findModel(DEFAULT_MODEL)!;

  return {
    apiKey,
    keySource: storedKey ? 'settings' : envKey ? 'env' : 'none',
    model: model.id,
    reasoningEffort: coerceEffort(model, get(userId, KEYS.effort) ?? DEFAULT_EFFORT),
    autoRun: getBool(userId, KEYS.autoRun, true),
    createCollections: getBool(userId, KEYS.createCollections, true),
  };
}

/** The single gate the rest of the app checks. No key, no feature. */
export function isAiConfigured(userId: number): boolean {
  return readAiConfig(userId).apiKey !== null;
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
  /** True when the operator set a shared key this account can fall back to. */
  sharedKeyAvailable: boolean;
  model: string;
  reasoningEffort: ReasoningEffort;
  autoRun: boolean;
  createCollections: boolean;
  models: Array<{ id: string; note: string; efforts: ReasoningEffort[] }>;
}

export function publicAiSettings(userId: number): AiSettingsPublic {
  const ai = readAiConfig(userId);
  return {
    configured: ai.apiKey !== null,
    keySource: ai.keySource,
    keyHint: hint(ai.apiKey),
    sharedKeyAvailable: config.openai.apiKey !== '',
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

export function updateAiSettings(userId: number, input: AiSettingsInput): AiSettingsPublic {
  if (input.model !== undefined && !findModel(input.model)) {
    throw badRequest(`Pocket does not know the model "${input.model}".`);
  }

  db.transaction(() => {
    if (input.apiKey !== undefined) {
      const key = input.apiKey.trim();
      if (key) writeSetting.run(userId, KEYS.apiKey, key);
      else clearSetting.run(userId, KEYS.apiKey);
    }
    if (input.model !== undefined) writeSetting.run(userId, KEYS.model, input.model);
    if (input.reasoningEffort !== undefined) writeSetting.run(userId, KEYS.effort, input.reasoningEffort);
    if (input.autoRun !== undefined) writeSetting.run(userId, KEYS.autoRun, input.autoRun ? '1' : '0');
    if (input.createCollections !== undefined) {
      writeSetting.run(userId, KEYS.createCollections, input.createCollections ? '1' : '0');
    }
  })();

  return publicAiSettings(userId);
}
