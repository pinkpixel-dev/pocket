import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Point data directory to a temporary directory before loading database
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pocket-cleanup-test-'));
process.env.POCKET_DATA_DIR = tmpDir;
process.env.POCKET_BLOCK_PRIVATE_ADDRESSES = '0';

// Import services after setting environment variables
const { db } = await import('../db/index.js');
const { parseBookmarkHtml, importLinks } = await import('./transfer.js');
const {
  createCollection,
  getCollection,
  listCollections,
  mergeCollections,
  convertCollectionsToTags,
  batchAssignBookmarksToCollection,
  getUncollectedDomainStats,
} = await import('./collections.js');
const { createBookmark, getBookmark } = await import('./bookmarks.js');
const { applyBatchCategorization } = await import('./ai-batch.js');

test.after(() => {
  try {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Cleanup
  }
});

test('parseBookmarkHtml extracts nested folder hierarchy', () => {
  const html = `
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>Bookmarks bar</H3>
    <DL><p>
        <DT><H3>Development</H3>
        <DL><p>
            <DT><H3>Frontend</H3>
            <DL><p>
                <DT><A HREF="https://react.dev">React</A>
            </DL><p>
        </DL><p>
        <DT><A HREF="https://rootlink.com">Root Link</A>
    </DL><p>
</DL><p>
`;

  const links = parseBookmarkHtml(html);
  assert.equal(links.length, 2);

  const reactLink = links.find((l) => l.url === 'https://react.dev')!;
  assert.ok(reactLink);
  assert.deepEqual(reactLink.folderPath, ['Development', 'Frontend']);
  assert.equal(reactLink.collection, 'Frontend');

  const rootLink = links.find((l) => l.url === 'https://rootlink.com')!;
  assert.ok(rootLink);
  assert.deepEqual(rootLink.folderPath, []);
  assert.equal(rootLink.collection, null);
});

test('importLinks handles folderStrategy: hierarchy and defaultCollection', async () => {
  const links = [
    {
      url: 'https://site-nested.com',
      title: 'Nested Site',
      description: '',
      tags: ['cool'],
      collection: 'SubChild',
      folderPath: ['TopLevel', 'SubChild'],
    },
    {
      url: 'https://site-root.com',
      title: 'Root Site',
      description: '',
      tags: [],
      collection: null,
      folderPath: [],
    },
  ];

  const summary = await importLinks(links, {
    fetchMetadata: false,
    folderStrategy: 'hierarchy',
    defaultCollection: 'Inbox',
  });

  assert.equal(summary.imported, 2);

  const collections = listCollections();
  const topCol = collections.find((c) => c.name === 'TopLevel');
  const inboxCol = collections.find((c) => c.name === 'Inbox');
  assert.ok(topCol);
  assert.ok(inboxCol);

  const nestedBm = getBookmark(1)!;
  assert.equal(nestedBm.collectionId, topCol.id);
  assert.ok(nestedBm.tags.includes('subchild'));
  assert.ok(nestedBm.tags.includes('cool'));

  const rootBm = getBookmark(2)!;
  assert.equal(rootBm.collectionId, inboxCol.id);
});

test('mergeCollections moves bookmarks and deletes source collections', () => {
  const colA = createCollection({ name: 'Alpha' });
  const colB = createCollection({ name: 'Beta' });
  const targetCol = createCollection({ name: 'Merged' });

  const bmA = createBookmark({
    url: 'https://alpha.org',
    title: 'Alpha Site',
    collectionId: colA.id,
    metadataStatus: 'manual',
  });
  const bmB = createBookmark({
    url: 'https://beta.org',
    title: 'Beta Site',
    collectionId: colB.id,
    metadataStatus: 'manual',
  });

  const res = mergeCollections([colA.id, colB.id], targetCol.id);
  assert.equal(res.movedCount, 2);
  assert.equal(res.deletedCollections, 2);

  assert.equal(getCollection(colA.id), undefined);
  assert.equal(getCollection(colB.id), undefined);

  const updatedA = getBookmark(bmA.bookmark.id)!;
  const updatedB = getBookmark(bmB.bookmark.id)!;
  assert.equal(updatedA.collectionId, targetCol.id);
  assert.equal(updatedB.collectionId, targetCol.id);
});

test('mergeCollections can keep each source name as a tag', () => {
  const music = createCollection({ name: 'AI music' });
  const prompting = createCollection({ name: 'AI prompting' });
  const target = createCollection({ name: 'AI' });

  const song = createBookmark({
    url: 'https://suno.example/song',
    title: 'Song tool',
    collectionId: music.id,
    metadataStatus: 'manual',
  });
  const prompt = createBookmark({
    url: 'https://prompts.example/guide',
    title: 'Prompt guide',
    collectionId: prompting.id,
    metadataStatus: 'manual',
  });

  const res = mergeCollections([music.id, prompting.id], target.id, { tagWithSourceNames: true });

  assert.equal(res.movedCount, 2);
  assert.equal(res.taggedCount, 2);
  assert.deepEqual(getBookmark(song.bookmark.id)!.tags, ['ai music']);
  assert.deepEqual(getBookmark(prompt.bookmark.id)!.tags, ['ai prompting']);
  assert.equal(getBookmark(song.bookmark.id)!.collectionId, target.id);
});

test('convertCollectionsToTags converts collection to tag and deletes collection', () => {
  const microCol = createCollection({ name: 'Micro Topic' });
  const bm = createBookmark({
    url: 'https://micro.org',
    title: 'Micro Site',
    collectionId: microCol.id,
    metadataStatus: 'manual',
  });

  const res = convertCollectionsToTags([microCol.id]);
  assert.equal(res.converted, 1);
  assert.equal(res.bookmarksTagged, 1);

  assert.equal(getCollection(microCol.id), undefined);

  const updatedBm = getBookmark(bm.bookmark.id)!;
  assert.equal(updatedBm.collectionId, null);
  assert.ok(updatedBm.tags.includes('micro topic'));
});

test('batchAssignBookmarksToCollection and getUncollectedDomainStats', () => {
  const bm1 = createBookmark({
    url: 'https://github.com/torvalds/linux',
    title: 'Linux',
    metadataStatus: 'manual',
  });
  const bm2 = createBookmark({
    url: 'https://github.com/facebook/react',
    title: 'React',
    metadataStatus: 'manual',
  });

  const domains = getUncollectedDomainStats(10);
  const githubGroup = domains.find((d) => d.domain === 'github.com');
  assert.ok(githubGroup);
  assert.ok(githubGroup.count >= 2);
  assert.ok(githubGroup.bookmarkIds.includes(bm1.bookmark.id));
  assert.ok(githubGroup.bookmarkIds.includes(bm2.bookmark.id));

  const targetCol = createCollection({ name: 'Code Repos' });
  const count = batchAssignBookmarksToCollection([bm1.bookmark.id, bm2.bookmark.id], targetCol.id);
  assert.equal(count, 2);

  const updatedBm1 = getBookmark(bm1.bookmark.id)!;
  assert.equal(updatedBm1.collectionId, targetCol.id);
});

test('applyBatchCategorization creates collections, assigns bookmarks, and links tags', () => {
  const bm = createBookmark({
    url: 'https://news.ycombinator.com',
    title: 'Hacker News',
    metadataStatus: 'manual',
  });

  const result = applyBatchCategorization([
    {
      bookmarkId: bm.bookmark.id,
      collectionName: 'Tech News',
      tags: ['startups', 'tech'],
    },
  ]);

  assert.equal(result.applied, 1);

  const updated = getBookmark(bm.bookmark.id)!;
  assert.ok(updated.collectionId);
  const col = getCollection(updated.collectionId)!;
  assert.equal(col.name, 'Tech News');
  assert.ok(updated.tags.includes('startups'));
  assert.ok(updated.tags.includes('tech'));
});
