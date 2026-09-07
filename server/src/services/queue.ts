import { db } from '../db/index.js';
import { enrichBookmark, type EnrichOptions } from './enrich.js';
import { fillWithAi, markAiPending } from './ai.js';
import { isAiConfigured, readAiConfig } from './settings.js';

interface EnrichJob {
  kind: 'enrich';
  userId: number;
  bookmarkId: number;
  options: EnrichOptions;
  /** Imports turn this off. See enqueueEnrich. */
  autoAi: boolean;
}

interface AiJob {
  kind: 'ai';
  userId: number;
  bookmarkId: number;
  /** Carried over from the metadata fetch so the page is read only once. */
  excerpt: string;
}

type Job = EnrichJob | AiJob;

/**
 * A small in-process queue. A household library never has enough work to
 * justify a broker, but unbounded parallel fetching would still hammer the NAS.
 * The limit is shared across accounts on purpose: it is the NAS's uplink being
 * protected, not any one person's library.
 */
const CONCURRENCY = 3;

const pending: Job[] = [];
const inFlight = new Set<string>();
/** The in-flight jobs by key, so a per-account count can see them. */
const runningJobs = new Map<string, Job>();
let running = 0;

// Bookmark ids are unique across the whole database, so the owner is not part
// of the key. It rides along on the job because every service call needs it.
const keyOf = (job: Job): string => `${job.kind}:${job.bookmarkId}`;

/** How much work is queued for one account, which is what its Settings shows. */
export function queueSize(userId: number): number {
  let count = 0;
  for (const job of pending) if (job.userId === userId) count += 1;
  for (const job of runningJobs.values()) if (job.userId === userId) count += 1;
  return count;
}

/**
 * The AI pass is chained here rather than inside the metadata job, so it only
 * ever runs on a bookmark whose own metadata has already been written.
 */
async function run(job: Job): Promise<void> {
  if (job.kind === 'ai') {
    await fillWithAi(job.userId, job.bookmarkId, { excerpt: job.excerpt });
    return;
  }

  const result = await enrichBookmark(job.userId, job.bookmarkId, job.options);
  if (job.autoAi && result.bookmark) enqueueAutoAiFill(job.userId, job.bookmarkId, result.excerpt);
}

function pump(): void {
  while (running < CONCURRENCY && pending.length > 0) {
    const job = pending.shift()!;
    const key = keyOf(job);
    if (inFlight.has(key)) continue;

    inFlight.add(key);
    runningJobs.set(key, job);
    running += 1;

    void run(job)
      .catch((error: unknown) => {
        console.error(`[pocket] ${job.kind} job failed for bookmark ${job.bookmarkId}:`, error);
      })
      .finally(() => {
        inFlight.delete(key);
        runningJobs.delete(key);
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
export function enqueueEnrich(
  userId: number,
  bookmarkId: number,
  options: EnrichOptions = {},
  autoAi = true,
): void {
  enqueue({ kind: 'enrich', userId, bookmarkId, options, autoAi });
}

/**
 * Queued by the metadata job once it finishes, so the model only ever sees a
 * bookmark that has already filled in everything it could on its own.
 */
export function enqueueAiFill(userId: number, bookmarkId: number, excerpt = ''): void {
  if (!isAiConfigured(userId)) return;
  markAiPending(userId, bookmarkId);
  enqueue({ kind: 'ai', userId, bookmarkId, excerpt });
}

/** The automatic pass, which the AI settings can turn off without disabling the button. */
export function enqueueAutoAiFill(userId: number, bookmarkId: number, excerpt = ''): void {
  const ai = readAiConfig(userId);
  if (!ai.apiKey || !ai.autoRun) return;
  enqueueAiFill(userId, bookmarkId, excerpt);
}

/**
 * Anything left pending when the process stopped gets picked back up, so a
 * restart mid-import does not leave bookmarks stuck without previews. The
 * owner comes from the row, because at startup there is nobody signed in.
 */
export function resumePendingJobs(): number {
  const stale = db
    .prepare(
      `SELECT id, user_id AS userId, metadata_status AS metadataStatus, ai_status AS aiStatus
         FROM bookmarks
        WHERE metadata_status = 'pending' OR ai_status = 'pending'
        ORDER BY created_at ASC
        LIMIT 500`,
    )
    .all() as Array<{ id: number; userId: number; metadataStatus: string; aiStatus: string }>;

  for (const row of stale) {
    if (row.metadataStatus === 'pending') enqueueEnrich(row.userId, row.id);
    else if (row.aiStatus === 'pending') enqueueAiFill(row.userId, row.id);
  }
  return stale.length;
}
