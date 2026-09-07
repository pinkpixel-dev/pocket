import { db } from '../db/index.js';
import { probeUrl } from '../lib/http.js';
import type { MetadataStatus } from '../lib/types.js';

export interface AuditStatus {
  running: boolean;
  total: number;
  checked: number;
  broken: number;
  lastRunAt: string | null;
}

interface BookmarkAuditRow {
  id: number;
  url: string;
  preview_path: string | null;
  metadata_status: MetadataStatus;
  metadata_error: string | null;
}

let running = false;
let cancelRequested = false;
let total = 0;
let checked = 0;
let broken = 0;
let lastRunAt: string | null = null;

export function getAuditStatus(): AuditStatus {
  return {
    running,
    total,
    checked,
    broken,
    lastRunAt,
  };
}

export function cancelLibraryAudit(): boolean {
  if (!running) return false;
  cancelRequested = true;
  return true;
}

const CONCURRENCY = 5;

const markAuditFailed = db.prepare(
  `UPDATE bookmarks
      SET metadata_status = 'failed',
          metadata_error = @error,
          metadata_fetched_at = datetime('now'),
          updated_at = datetime('now')
    WHERE id = @id`,
);

const markAuditRecovered = db.prepare(
  `UPDATE bookmarks
      SET metadata_status = @status,
          metadata_error = NULL,
          metadata_fetched_at = datetime('now'),
          updated_at = datetime('now')
    WHERE id = @id`,
);

async function runAudit(): Promise<void> {
  const bookmarks = db
    .prepare(
      `SELECT id, url, preview_path, metadata_status, metadata_error
         FROM bookmarks
        ORDER BY id ASC`,
    )
    .all() as BookmarkAuditRow[];

  total = bookmarks.length;
  checked = 0;
  broken = 0;

  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < bookmarks.length) {
      if (cancelRequested) break;
      const index = cursor++;
      const item = bookmarks[index];
      if (!item) break;

      try {
        const probe = await probeUrl(item.url);
        if (cancelRequested) break;

        if (!probe.alive) {
          broken += 1;
          const errorMsg = (probe.error ?? 'Link unreachable').slice(0, 400);
          markAuditFailed.run({ id: item.id, error: errorMsg });
        } else if (item.metadata_status === 'failed') {
          // Link recovered
          const restoredStatus: MetadataStatus = item.preview_path ? 'ok' : 'partial';
          markAuditRecovered.run({ id: item.id, status: restoredStatus });
        }
      } catch {
        if (!cancelRequested) {
          broken += 1;
          markAuditFailed.run({ id: item.id, error: 'Could not connect to URL' });
        }
      } finally {
        checked += 1;
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, bookmarks.length) }, () => worker());
  await Promise.all(workers);
}

export function startLibraryAudit(): AuditStatus {
  if (running) return getAuditStatus();

  running = true;
  cancelRequested = false;
  checked = 0;
  broken = 0;

  // Run in background without blocking caller
  void runAudit()
    .catch((error: unknown) => {
      console.error('[pocket] Library audit error:', error);
    })
    .finally(() => {
      running = false;
      lastRunAt = new Date().toISOString();
    });

  return getAuditStatus();
}
