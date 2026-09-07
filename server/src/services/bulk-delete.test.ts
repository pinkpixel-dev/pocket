import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The database is created on import, so point it at a scratch directory first.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pocket-bulk-delete-test-'));
process.env.POCKET_DATA_DIR = tmpDir;
process.env.POCKET_BLOCK_PRIVATE_ADDRESSES = '0';

const { db } = await import('../db/index.js');
const {
  createBookmark,
  deleteBookmarks,
  dismissBroken,
  dismissBrokenBulk,
  getBookmark,
  listBookmarks,
  countBookmarks,
} = await import('./bookmarks.js');
const { listTags } = await import('./tags.js');


/**
 * Every library table is scoped to an account now. Migration 4 seeds the owner
 * row, so these tests file everything under it.
 */
const OWNER = 1;

test.after(() => {
  try {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // The temp directory is disposable either way.
  }
});

function save(url: string, tags: string[] = []): number {
  return createBookmark(OWNER, { url, tags, metadataStatus: 'failed' }).bookmark.id;
}

test('deleteBookmarks removes every id it is given', async () => {
  const ids = [save('https://one.example'), save('https://two.example'), save('https://three.example')];

  const deleted = await deleteBookmarks(OWNER, ids.slice(0, 2));

  assert.equal(deleted, 2);
  assert.equal(countBookmarks(OWNER), 1);
  assert.deepEqual(
    listBookmarks(OWNER, {}).items.map((item) => item.id),
    [ids[2]],
  );
});

test('deleteBookmarks skips ids that are already gone and prunes their tags', async () => {
  const kept = save('https://kept.example', ['keep']);
  const doomed = save('https://doomed.example', ['throwaway']);

  const deleted = await deleteBookmarks(OWNER, [doomed, 999_999]);

  assert.equal(deleted, 1);
  const tagNames = listTags(OWNER).map((tag) => tag.name);
  assert.ok(tagNames.includes('keep'));
  assert.ok(!tagNames.includes('throwaway'));
  assert.ok(listBookmarks(OWNER, {}).items.some((item) => item.id === kept));
});

test('deleteBookmarks on an empty list changes nothing', async () => {
  const before = countBookmarks(OWNER);
  assert.equal(await deleteBookmarks(OWNER, []), 0);
  assert.equal(countBookmarks(OWNER), before);
});

test('dismissBroken clears error and restores failed status', async () => {
  const id = save('https://broken-test.example');
  const dismissed = dismissBroken(OWNER, id);
  assert.equal(dismissed.metadataStatus, 'manual');
  assert.equal(getBookmark(OWNER, id).metadataError, null);
});

test('dismissBrokenBulk clears multiple failed bookmarks in bulk', async () => {
  const id1 = save('https://bulk-broken-1.example');
  const id2 = save('https://bulk-broken-2.example');

  const count = dismissBrokenBulk(OWNER, [id1, id2]);
  assert.equal(count, 2);
  assert.equal(getBookmark(OWNER, id1).metadataStatus, 'manual');
  assert.equal(getBookmark(OWNER, id2).metadataStatus, 'manual');
  assert.equal(getBookmark(OWNER, id1).metadataError, null);
  assert.equal(getBookmark(OWNER, id2).metadataError, null);
});

