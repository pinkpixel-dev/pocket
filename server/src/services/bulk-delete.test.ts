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
const { createBookmark, deleteBookmarks, listBookmarks, countBookmarks } = await import(
  './bookmarks.js'
);
const { listTags } = await import('./tags.js');

test.after(() => {
  try {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // The temp directory is disposable either way.
  }
});

function save(url: string, tags: string[] = []): number {
  return createBookmark({ url, tags, metadataStatus: 'failed' }).bookmark.id;
}

test('deleteBookmarks removes every id it is given', async () => {
  const ids = [save('https://one.example'), save('https://two.example'), save('https://three.example')];

  const deleted = await deleteBookmarks(ids.slice(0, 2));

  assert.equal(deleted, 2);
  assert.equal(countBookmarks(), 1);
  assert.deepEqual(
    listBookmarks({}).items.map((item) => item.id),
    [ids[2]],
  );
});

test('deleteBookmarks skips ids that are already gone and prunes their tags', async () => {
  const kept = save('https://kept.example', ['keep']);
  const doomed = save('https://doomed.example', ['throwaway']);

  const deleted = await deleteBookmarks([doomed, 999_999]);

  assert.equal(deleted, 1);
  const tagNames = listTags().map((tag) => tag.name);
  assert.ok(tagNames.includes('keep'));
  assert.ok(!tagNames.includes('throwaway'));
  assert.ok(listBookmarks({}).items.some((item) => item.id === kept));
});

test('deleteBookmarks on an empty list changes nothing', async () => {
  const before = countBookmarks();
  assert.equal(await deleteBookmarks([]), 0);
  assert.equal(countBookmarks(), before);
});
