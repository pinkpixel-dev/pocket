import { db } from '../db/index.js';
import { enrichBookmark, type EnrichOptions } from './enrich.js';

interface Job {
  bookmarkId: number;
  options: EnrichOptions;
}

/**
 * A small in-process queue. A single-user library never has enough work to
 * justify a broker, but unbounded parallel fetching would still hammer the NAS.
 */
const CONCURRENCY = 3;

const pending: Job[] = [];
const inFlight = new Set<number>();
let running = 0;

export function queueSize(): number {
  return pending.length + inFlight.size;
}

function pump(): void {
  while (running < CONCURRENCY && pending.length > 0) {
    const job = pending.shift()!;
    if (inFlight.has(job.bookmarkId)) continue;

    inFlight.add(job.bookmarkId);
    running += 1;

    void enrichBookmark(job.bookmarkId, job.options)
      .catch((error: unknown) => {
        console.error(`[pocket] metadata job failed for bookmark ${job.bookmarkId}:`, error);
      })
      .finally(() => {
        inFlight.delete(job.bookmarkId);
        running -= 1;
        pump();
      });
  }
}

export function enqueueEnrich(bookmarkId: number, options: EnrichOptions = {}): void {
  if (inFlight.has(bookmarkId) || pending.some((job) => job.bookmarkId === bookmarkId)) return;
  pending.push({ bookmarkId, options });
  queueMicrotask(pump);
}

/**
 * Anything left pending when the process stopped gets picked back up, so a
 * restart mid-import does not leave bookmarks stuck without previews.
 */
export function resumePendingJobs(): number {
  const rows = db
    .prepare(
      `SELECT id FROM bookmarks
        WHERE metadata_status = 'pending'
        ORDER BY created_at ASC
        LIMIT 500`,
    )
    .all() as Array<{ id: number }>;

  for (const row of rows) enqueueEnrich(row.id);
  return rows.length;
}
