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

interface AuditState {
  running: boolean;
  cancelRequested: boolean;
  total: number;
  checked: number;
  broken: number;
  lastRunAt: string | null;
}

/**
 * One scan per account, tracked separately. A shared counter would let one
 * person's scan overwrite the progress bar someone else is watching, and would
 * let either of them cancel the other's run.
 */
const states = new Map<number, AuditState>();

function stateFor(userId: number): AuditState {
  let state = states.get(userId);
  if (!state) {
    state = { running: false, cancelRequested: false, total: 0, checked: 0, broken: 0, lastRunAt: null };
    states.set(userId, state);
  }
  return state;
}

export function getAuditStatus(userId: number): AuditStatus {
  const state = stateFor(userId);
  return {
    running: state.running,
    total: state.total,
    checked: state.checked,
    broken: state.broken,
    lastRunAt: state.lastRunAt,
  };
}

export function cancelLibraryAudit(userId: number): boolean {
  const state = stateFor(userId);
  if (!state.running) return false;
  state.cancelRequested = true;
  return true;
}

const CONCURRENCY = 5;

const markAuditFailed = db.prepare(
  `UPDATE bookmarks
      SET metadata_status = 'failed',
          metadata_error = @error,
          metadata_fetched_at = datetime('now'),
          updated_at = datetime('now')
    WHERE id = @id AND user_id = @userId`,
);

const markAuditRecovered = db.prepare(
  `UPDATE bookmarks
      SET metadata_status = @status,
          metadata_error = NULL,
          metadata_fetched_at = datetime('now'),
          updated_at = datetime('now')
    WHERE id = @id AND user_id = @userId`,
);

/**
 * SQLite caps how many parameters one statement may carry, and an import can
 * hand this a five figure list, so the ids go over in chunks rather than as
 * one enormous IN clause.
 */
const ID_CHUNK = 500;

function selectBookmarks(userId: number, ids: number[] | undefined): BookmarkAuditRow[] {
  const columns = 'id, url, preview_path, metadata_status, metadata_error';

  if (!ids) {
    return db
      .prepare(`SELECT ${columns} FROM bookmarks WHERE user_id = ? ORDER BY id ASC`)
      .all(userId) as BookmarkAuditRow[];
  }

  const rows: BookmarkAuditRow[] = [];
  for (let index = 0; index < ids.length; index += ID_CHUNK) {
    const chunk = ids.slice(index, index + ID_CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    rows.push(
      ...(db
        .prepare(
          `SELECT ${columns} FROM bookmarks
            WHERE user_id = ? AND id IN (${placeholders})
            ORDER BY id ASC`,
        )
        .all(userId, ...chunk) as BookmarkAuditRow[]),
    );
  }
  return rows;
}

async function runAudit(userId: number, state: AuditState, ids: number[] | undefined): Promise<void> {
  const bookmarks = selectBookmarks(userId, ids);

  state.total = bookmarks.length;
  state.checked = 0;
  state.broken = 0;

  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < bookmarks.length) {
      if (state.cancelRequested) break;
      const index = cursor++;
      const item = bookmarks[index];
      if (!item) break;

      try {
        const probe = await probeUrl(item.url);
        if (state.cancelRequested) break;

        if (!probe.alive) {
          state.broken += 1;
          const errorMsg = (probe.error ?? 'Link unreachable').slice(0, 400);
          markAuditFailed.run({ id: item.id, userId, error: errorMsg });
        } else if (item.metadata_status === 'failed') {
          // Link recovered
          const restoredStatus: MetadataStatus = item.preview_path ? 'ok' : 'partial';
          markAuditRecovered.run({ id: item.id, userId, status: restoredStatus });
        }
      } catch {
        if (!state.cancelRequested) {
          state.broken += 1;
          markAuditFailed.run({ id: item.id, userId, error: 'Could not connect to URL' });
        }
      } finally {
        state.checked += 1;
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, bookmarks.length) }, () => worker());
  await Promise.all(workers);
}

export interface AuditOptions {
  /**
   * Limits the scan to these bookmarks. An import passes the rows it just
   * wrote, so a fresh file is checked without re-reading the whole library.
   */
  ids?: number[];
}

export function startLibraryAudit(userId: number, options: AuditOptions = {}): AuditStatus {
  const state = stateFor(userId);
  if (state.running) return getAuditStatus(userId);

  state.running = true;
  state.cancelRequested = false;
  state.checked = 0;
  state.broken = 0;

  // Run in background without blocking caller
  void runAudit(userId, state, options.ids)
    .catch((error: unknown) => {
      console.error('[pocket] Library audit error:', error);
    })
    .finally(() => {
      state.running = false;
      state.lastRunAt = new Date().toISOString();
    });

  return getAuditStatus(userId);
}

/** Called when an account is removed, so its scan state does not outlive it. */
export function forgetAuditState(userId: number): void {
  states.delete(userId);
}
