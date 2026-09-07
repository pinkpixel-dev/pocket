import { db } from '../db/index.js';
import { enrichBookmark, type EnrichOptions } from './enrich.js';
import { fillWithAi, markAiPending } from './ai.js';
import { isAiConfigured, readAiConfig } from './settings.js';

interface EnrichJob {
  kind: 'enrich';
  bookmarkId: number;
  options: EnrichOptions;
  /** Imports turn this off. See enqueueEnrich. */
  autoAi: boolean;
}

interface AiJob {
  kind: 'ai';
  bookmarkId: number;
  /** Carried over from the metadata fetch so the page is read only once. */
  excerpt: string;
}

type Job = EnrichJob | AiJob;

/**
 * A small in-process queue. A single-user library never has enough work to
 * justify a broker, but unbounded parallel fetching would still hammer the NAS.
 */
const CONCURRENCY = 3;

const pending: Job[] = [];
const inFlight = new Set<string>();
let running = 0;

const keyOf = (job: Job): string => `${job.kind}:${job.bookmarkId}`;

export function queueSize(): number {
  return pending.length + inFlight.size;
}

/**
 * The AI pass is chained here rather than inside the metadata job, so it only
 * ever runs on a bookmark whose own metadata has already been written.
 */
async function run(job: Job): Promise<void> {
  if (job.kind === 'ai') {
    await fillWithAi(job.bookmarkId, { excerpt: job.excerpt });
    return;
  }

  const result = await enrichBookmark(job.bookmarkId, job.options);
  if (job.autoAi && result.bookmark) enqueueAutoAiFill(job.bookmarkId, result.excerpt);
}

function pump(): void {
  while (running < CONCURRENCY && pending.length > 0) {
    const job = pending.shift()!;
    const key = keyOf(job);
    if (inFlight.has(key)) continue;

    inFlight.add(key);
    running += 1;

    void run(job)
      .catch((error: unknown) => {
        console.error(`[pocket] ${job.kind} job failed for bookmark ${job.bookmarkId}:`, error);
      })
      .finally(() => {
        inFlight.delete(key);
        running -= 1;
        pump();
      });
  }
}

function enqueue(job: Job): void {
  const key = keyOf(job);
  if (inFlight.has(key) || pending.some((queued) => keyOf(queued) === key)) return;
  pending.push(job);
  queueMicrotask(pump);
}

/**
 * `autoAi` is off for imports on purpose. Chaining a paid API call onto every
 * row of a browser export is a bill nobody asked for; those bookmarks get the
 * AI pass one at a time from the card menu instead.
 */
export function enqueueEnrich(bookmarkId: number, options: EnrichOptions = {}, autoAi = true): void {
  enqueue({ kind: 'enrich', bookmarkId, options, autoAi });
}

/**
 * Queued by the metadata job once it finishes, so the model only ever sees a
 * bookmark that has already filled in everything it could on its own.
 */
export function enqueueAiFill(bookmarkId: number, excerpt = ''): void {
  if (!isAiConfigured()) return;
  markAiPending(bookmarkId);
  enqueue({ kind: 'ai', bookmarkId, excerpt });
}

/** The automatic pass, which the AI settings can turn off without disabling the button. */
export function enqueueAutoAiFill(bookmarkId: number, excerpt = ''): void {
  const ai = readAiConfig();
  if (!ai.apiKey || !ai.autoRun) return;
  enqueueAiFill(bookmarkId, excerpt);
}

/**
 * Anything left pending when the process stopped gets picked back up, so a
 * restart mid-import does not leave bookmarks stuck without previews.
 */
export function resumePendingJobs(): number {
  const stale = db
    .prepare(
      `SELECT id, metadata_status AS metadataStatus, ai_status AS aiStatus FROM bookmarks
        WHERE metadata_status = 'pending' OR ai_status = 'pending'
        ORDER BY created_at ASC
        LIMIT 500`,
    )
    .all() as Array<{ id: number; metadataStatus: string; aiStatus: string }>;

  for (const row of stale) {
    if (row.metadataStatus === 'pending') enqueueEnrich(row.id);
    else if (row.aiStatus === 'pending') enqueueAiFill(row.id);
  }
  return stale.length;
}
