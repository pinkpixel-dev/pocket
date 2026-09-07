import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ParsedLink } from './transfer.js';

// The database is created on import, so point it at a scratch directory first.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pocket-import-check-test-'));
process.env.POCKET_DATA_DIR = tmpDir;
process.env.POCKET_BLOCK_PRIVATE_ADDRESSES = '0';

const { db } = await import('../db/index.js');
const { importLinks } = await import('./transfer.js');
const { countBookmarks, listBookmarks } = await import('./bookmarks.js');
const { cancelLibraryAudit, getAuditStatus } = await import('./audit.js');
const { queueSize } = await import('./queue.js');

const OWNER = 1;

/**
 * Hosts that cannot resolve, so the link check has real work to do and every
 * one of these probes fails. Under the old code every one of them had to time
 * out before a single row was written.
 */
function unreachable(count: number): ParsedLink[] {
  return Array.from({ length: count }, (_, index) => ({
    url: `https://pocket-test-${index}-does-not-resolve.invalid/page`,
    title: `Link ${index}`,
    description: '',
    tags: [],
    collection: null,
  }));
}

/** Waits for the background work to stop, so nothing outlives the connection. */
async function settle(): Promise<void> {
  cancelLibraryAudit(OWNER);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!getAuditStatus(OWNER).running && queueSize(OWNER) === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

test.after(async () => {
  await settle();
  try {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // The temp directory is disposable either way.
  }
});

test('an import with the link check on saves every bookmark before checking any of them', async () => {
  const links = unreachable(6);

  const started = Date.now();
  const summary = await importLinks(OWNER, links, { fetchMetadata: false, checkLinks: true });
  const elapsed = Date.now() - started;

  // The rows are written by the time the call returns, which is the whole
  // point: probing first meant an unreachable file imported nothing at all.
  assert.equal(summary.imported, 6);
  assert.equal(countBookmarks(OWNER), 6);
  assert.equal(summary.checkingLinks, 6);

  // Six unreachable hosts cost at least one full probe timeout under the old
  // code. Importing does no network work at all, so this is generous.
  assert.ok(elapsed < 2000, `import took ${elapsed}ms, so it is still waiting on the network`);

  await settle();
});

test('the check started by an import is scoped to the links that import wrote', async () => {
  // Already in the library, and not part of the next import.
  await importLinks(OWNER, unreachable(6).slice(0, 3), { fetchMetadata: false });
  await importLinks(
    OWNER,
    [
      {
        url: 'https://pocket-test-existing.invalid/page',
        title: 'Existing',
        description: '',
        tags: [],
        collection: null,
      },
    ],
    { fetchMetadata: false },
  );

  const before = countBookmarks(OWNER);
  const summary = await importLinks(
    OWNER,
    [
      {
        url: 'https://pocket-test-fresh-a.invalid/page',
        title: 'Fresh A',
        description: '',
        tags: [],
        collection: null,
      },
      {
        url: 'https://pocket-test-fresh-b.invalid/page',
        title: 'Fresh B',
        description: '',
        tags: [],
        collection: null,
      },
    ],
    { fetchMetadata: false, checkLinks: true },
  );

  assert.equal(summary.imported, 2);
  assert.ok(before > 2, 'the library needs links the import did not add for this to mean anything');

  // The scan counts what it will read before it reads any of it.
  let total = getAuditStatus(OWNER).total;
  for (let attempt = 0; attempt < 50 && total === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    total = getAuditStatus(OWNER).total;
  }
  assert.equal(total, 2, 'the check should read the imported links, not the whole library');

  await settle();
});

test('the link check is left to the metadata pass when that is already running', async () => {
  const summary = await importLinks(
    OWNER,
    [
      {
        url: 'https://pocket-test-metadata.invalid/page',
        title: 'Metadata',
        description: '',
        tags: [],
        collection: null,
      },
    ],
    { fetchMetadata: true, checkLinks: true },
  );

  assert.equal(summary.imported, 1);
  // Reported as covered, because fetching the page is already a read of it.
  assert.equal(summary.checkingLinks, 1);
  assert.equal(getAuditStatus(OWNER).running, false, 'a second scan would double every request');

  // The metadata pass marks it pending, and the queue picks it up from there.
  const row = listBookmarks(OWNER, { search: 'pocket-test-metadata' }).items[0];
  assert.ok(row);
  assert.equal(row.metadataStatus, 'pending');
});
