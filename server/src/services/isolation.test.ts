import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The database is created on import, so point it at a scratch directory first.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pocket-isolation-test-'));
process.env.POCKET_DATA_DIR = tmpDir;
process.env.POCKET_BLOCK_PRIVATE_ADDRESSES = '0';

const { db } = await import('../db/index.js');
const {
  createBookmark,
  deleteBookmark,
  deleteBookmarks,
  getBookmark,
  listBookmarks,
  setPinned,
  updateBookmark,
} = await import('./bookmarks.js');
const {
  createCollection,
  listCollections,
  deleteCollection,
  mergeCollections,
  batchAssignBookmarksToCollection,
} = await import('./collections.js');
const { listTags, deleteTag, renameTag } = await import('./tags.js');
const { readAiConfig, updateAiSettings } = await import('./settings.js');
const { claimOwner, createUser, deleteUser } = await import('./users.js');

test.after(() => {
  try {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // The temp directory is disposable either way.
  }
});

/**
 * Two real accounts, made the way the app makes them: the owner claims the row
 * migration 4 left behind, and the owner then adds someone else.
 */
const owner = await claimOwner({ username: 'alex', password: 'a-long-enough-passphrase' });
const guest = await createUser({ username: 'sam', password: 'another-long-passphrase' });

test('two accounts can each save the same URL', () => {
  const mine = createBookmark(owner.id, { url: 'https://shared.example/page', metadataStatus: 'manual' });
  const theirs = createBookmark(guest.id, { url: 'https://shared.example/page', metadataStatus: 'manual' });

  assert.equal(mine.created, true);
  assert.equal(theirs.created, true);
  assert.notEqual(mine.bookmark.id, theirs.bookmark.id);

  // And saving it twice within one account is still a duplicate.
  const again = createBookmark(owner.id, { url: 'https://shared.example/page' });
  assert.equal(again.created, false);
  assert.equal(again.bookmark.id, mine.bookmark.id);
});

test('two accounts can each have a collection with the same name', () => {
  const mine = createCollection(owner.id, { name: 'Reading' });
  const theirs = createCollection(guest.id, { name: 'Reading' });

  assert.notEqual(mine.id, theirs.id);
  assert.deepEqual(
    listCollections(owner.id).map((item) => item.id),
    [mine.id],
  );
  assert.deepEqual(
    listCollections(guest.id).map((item) => item.id),
    [theirs.id],
  );
});

test('a listing only ever returns the asking account rows', () => {
  createBookmark(owner.id, {
    url: 'https://only-mine.example/link',
    tags: ['mine'],
    metadataStatus: 'manual',
  });
  createBookmark(guest.id, {
    url: 'https://only-theirs.example/link',
    tags: ['theirs'],
    metadataStatus: 'manual',
  });

  const mine = listBookmarks(owner.id, {}).items.map((item) => item.url);
  const theirs = listBookmarks(guest.id, {}).items.map((item) => item.url);

  assert.ok(mine.includes('https://only-mine.example/link'));
  assert.ok(!mine.some((url) => url.includes('only-theirs')));
  assert.ok(theirs.includes('https://only-theirs.example/link'));
  assert.ok(!theirs.some((url) => url.includes('only-mine')));

  assert.deepEqual(listTags(owner.id).map((tag) => tag.name), ['mine']);
  assert.deepEqual(listTags(guest.id).map((tag) => tag.name), ['theirs']);

  // A search must not reach across either, since that is the easiest leak.
  assert.equal(listBookmarks(owner.id, { search: 'only-theirs' }).total, 0);
});

test('reading someone else bookmark by id is a 404, not their data', () => {
  const theirs = createBookmark(guest.id, {
    url: 'https://private.example/theirs',
    metadataStatus: 'manual',
  }).bookmark;

  assert.throws(() => getBookmark(owner.id, theirs.id), /no longer exists/);
  assert.throws(() => updateBookmark(owner.id, theirs.id, { title: 'stolen' }), /no longer exists/);
  assert.throws(() => setPinned(owner.id, theirs.id, true), /no longer exists/);

  // And the row is untouched by any of it.
  assert.equal(getBookmark(guest.id, theirs.id).title, '');
  assert.equal(getBookmark(guest.id, theirs.id).isPinned, false);
});

test('a delete cannot reach across accounts', async () => {
  const theirs = createBookmark(guest.id, {
    url: 'https://private.example/keep-me',
    metadataStatus: 'manual',
  }).bookmark;

  await assert.rejects(deleteBookmark(owner.id, theirs.id), /no longer exists/);
  assert.equal(await deleteBookmarks(owner.id, [theirs.id]), 0);

  assert.equal(getBookmark(guest.id, theirs.id).url, 'https://private.example/keep-me');
});

test('a collection id from another account is refused, not filed into', () => {
  const theirCollection = createCollection(guest.id, { name: 'Theirs only' });
  const mine = createBookmark(owner.id, {
    url: 'https://mine.example/filing',
    metadataStatus: 'manual',
  }).bookmark;

  assert.throws(
    () => updateBookmark(owner.id, mine.id, { collectionId: theirCollection.id }),
    /not in your library/,
  );
  assert.throws(
    () => createBookmark(owner.id, { url: 'https://new.example', collectionId: theirCollection.id }),
    /not in your library/,
  );

  assert.equal(getBookmark(owner.id, mine.id).collectionId, null);
  assert.throws(() => deleteCollection(owner.id, theirCollection.id), /no longer exists/);
  assert.throws(() => mergeCollections(owner.id, [theirCollection.id], theirCollection.id), /not found/);
});

test('a bulk assign skips ids that belong to someone else', () => {
  const mineCollection = createCollection(owner.id, { name: 'Batch target' });
  const mine = createBookmark(owner.id, { url: 'https://mine.example/batch', metadataStatus: 'manual' })
    .bookmark;
  const theirs = createBookmark(guest.id, {
    url: 'https://theirs.example/batch',
    metadataStatus: 'manual',
  }).bookmark;

  const updated = batchAssignBookmarksToCollection(owner.id, [mine.id, theirs.id], mineCollection.id);

  assert.equal(updated, 1);
  assert.equal(getBookmark(owner.id, mine.id).collectionId, mineCollection.id);
  assert.equal(getBookmark(guest.id, theirs.id).collectionId, null);
});

test('tags cannot be renamed or deleted across accounts', () => {
  createBookmark(guest.id, { url: 'https://theirs.example/tagged', tags: ['fragile'], metadataStatus: 'manual' });
  const theirTag = listTags(guest.id).find((tag) => tag.name === 'fragile')!;

  assert.throws(() => renameTag(owner.id, theirTag.id, 'wrecked'), /no longer exists/);
  assert.throws(() => deleteTag(owner.id, theirTag.id), /no longer exists/);

  assert.ok(listTags(guest.id).some((tag) => tag.name === 'fragile'));
});

test('AI settings are per account', () => {
  updateAiSettings(owner.id, { apiKey: 'sk-owner-key', autoRun: false });

  assert.equal(readAiConfig(owner.id).apiKey, 'sk-owner-key');
  assert.equal(readAiConfig(owner.id).autoRun, false);
  assert.equal(readAiConfig(guest.id).apiKey, null);
  assert.equal(readAiConfig(guest.id).autoRun, true);
});

test('deleting an account takes its library and leaves everything else', async () => {
  const doomed = await createUser({ username: 'casey', password: 'yet-another-passphrase' });
  createBookmark(doomed.id, { url: 'https://casey.example/one', tags: ['casey'], metadataStatus: 'manual' });
  createCollection(doomed.id, { name: 'Caseys shelf' });

  const ownerBefore = listBookmarks(owner.id, {}).total;

  await deleteUser(doomed.id);

  assert.equal(listBookmarks(doomed.id, {}).total, 0);
  assert.equal(listCollections(doomed.id).length, 0);
  assert.equal(listTags(doomed.id).length, 0);
  assert.equal(listBookmarks(owner.id, {}).total, ownerBefore);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
});

test('the owner account cannot be deleted', async () => {
  await assert.rejects(deleteUser(owner.id), /owner account cannot be deleted/);
});
