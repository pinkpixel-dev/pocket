import path from 'node:path';
import fs from 'node:fs';

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

const dataDir = path.resolve(process.env.POCKET_DATA_DIR ?? path.join(process.cwd(), '..', 'data'));

export const config = {
  port: envInt('PORT', 8420),
  host: process.env.HOST ?? '0.0.0.0',
  dataDir,
  dbPath: process.env.POCKET_DB_PATH ?? path.join(dataDir, 'pocket.db'),
  previewsDir: path.join(dataDir, 'previews'),
  faviconsDir: path.join(dataDir, 'favicons'),
  /** Where the built frontend lives. Absent in dev, where Vite serves it. */
  clientDir: path.resolve(process.env.POCKET_CLIENT_DIR ?? path.join(process.cwd(), '..', 'client', 'dist')),
  fetch: {
    /** Whole-request budget for one metadata fetch, in milliseconds. */
    timeoutMs: envInt('POCKET_FETCH_TIMEOUT_MS', 12_000),
    maxHtmlBytes: envInt('POCKET_MAX_HTML_BYTES', 2 * 1024 * 1024),
    maxImageBytes: envInt('POCKET_MAX_IMAGE_BYTES', 6 * 1024 * 1024),
    maxRedirects: envInt('POCKET_MAX_REDIRECTS', 5),
    userAgent:
      process.env.POCKET_USER_AGENT ??
      'Mozilla/5.0 (compatible; PocketBookmarks/0.1; +https://github.com/pinkpixel-dev)',
    /** Turn off only on a network where you trust every reachable host. */
    blockPrivateAddresses: envBool('POCKET_BLOCK_PRIVATE_ADDRESSES', true),
  },
  maxUploadBytes: envInt('POCKET_MAX_UPLOAD_BYTES', 32 * 1024 * 1024),
  openai: {
    /** Set this and the browser can no longer change the key. Optional. */
    apiKey: process.env.POCKET_OPENAI_API_KEY?.trim() || '',
    baseUrl: (process.env.POCKET_OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, ''),
    /** Reasoning models think before answering, so this is not the fetch budget. */
    timeoutMs: envInt('POCKET_OPENAI_TIMEOUT_MS', 60_000),
    /** How much page text goes into the prompt, in characters. */
    maxExcerptChars: envInt('POCKET_AI_EXCERPT_CHARS', 1_500),
  },
} as const;

export function ensureDataDirs(): void {
  for (const dir of [config.dataDir, config.previewsDir, config.faviconsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
