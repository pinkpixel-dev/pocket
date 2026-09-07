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
const { listTags, mergeTags, deleteTags } = await import('./tags.js');
const { applyBatchCategorization } = await import('./ai-batch.js');


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

  const summary = await importLinks(OWNER, links, {
    fetchMetadata: false,
    folderStrategy: 'hierarchy',
    defaultCollection: 'Inbox',
  });

  assert.equal(summary.imported, 2);

  const collections = listCollections(OWNER);
  const topCol = collections.find((c) => c.name === 'TopLevel');
  const inboxCol = collections.find((c) => c.name === 'Inbox');
  assert.ok(topCol);
  assert.ok(inboxCol);

  const nestedBm = getBookmark(OWNER, 1)!;
  assert.equal(nestedBm.collectionId, topCol.id);
  assert.ok(nestedBm.tags.includes('subchild'));
  assert.ok(nestedBm.tags.includes('cool'));

  const rootBm = getBookmark(OWNER, 2)!;
  assert.equal(rootBm.collectionId, inboxCol.id);
});

test('mergeCollections moves bookmarks and deletes source collections', () => {
  const colA = createCollection(OWNER, { name: 'Alpha' });
  const colB = createCollection(OWNER, { name: 'Beta' });
  const targetCol = createCollection(OWNER, { name: 'Merged' });

  const bmA = createBookmark(OWNER, {
    url: 'https://alpha.org',
    title: 'Alpha Site',
    collectionId: colA.id,
    metadataStatus: 'manual',
  });
  const bmB = createBookmark(OWNER, {
    url: 'https://beta.org',
    title: 'Beta Site',
    collectionId: colB.id,
    metadataStatus: 'manual',
  });

  const res = mergeCollections(OWNER, [colA.id, colB.id], targetCol.id);
  assert.equal(res.movedCount, 2);
  assert.equal(res.deletedCollections, 2);

  assert.equal(getCollection(OWNER, colA.id), undefined);
  assert.equal(getCollection(OWNER, colB.id), undefined);

  const updatedA = getBookmark(OWNER, bmA.bookmark.id)!;
  const updatedB = getBookmark(OWNER, bmB.bookmark.id)!;
  assert.equal(updatedA.collectionId, targetCol.id);
  assert.equal(updatedB.collectionId, targetCol.id);
});

test('mergeCollections can keep each source name as a tag', () => {
  const music = createCollection(OWNER, { name: 'AI music' });
  const prompting = createCollection(OWNER, { name: 'AI prompting' });
  const target = createCollection(OWNER, { name: 'AI' });

  const song = createBookmark(OWNER, {
    url: 'https://suno.example/song',
    title: 'Song tool',
    collectionId: music.id,
    metadataStatus: 'manual',
  });
  const prompt = createBookmark(OWNER, {
    url: 'https://prompts.example/guide',
    title: 'Prompt guide',
    collectionId: prompting.id,
    metadataStatus: 'manual',
  });

  const res = mergeCollections(OWNER, [music.id, prompting.id], target.id, { tagWithSourceNames: true });

  assert.equal(res.movedCount, 2);
  assert.equal(res.taggedCount, 2);
  assert.deepEqual(getBookmark(OWNER, song.bookmark.id)!.tags, ['ai music']);
  assert.deepEqual(getBookmark(OWNER, prompt.bookmark.id)!.tags, ['ai prompting']);
  assert.equal(getBookmark(OWNER, song.bookmark.id)!.collectionId, target.id);
});

test('convertCollectionsToTags converts collection to tag and deletes collection', () => {
  const microCol = createCollection(OWNER, { name: 'Micro Topic' });
  const bm = createBookmark(OWNER, {
    url: 'https://micro.org',
    title: 'Micro Site',
    collectionId: microCol.id,
    metadataStatus: 'manual',
  });

  const res = convertCollectionsToTags(OWNER, [microCol.id]);
  assert.equal(res.converted, 1);
  assert.equal(res.bookmarksTagged, 1);

  assert.equal(getCollection(OWNER, microCol.id), undefined);

  const updatedBm = getBookmark(OWNER, bm.bookmark.id)!;
  assert.equal(updatedBm.collectionId, null);
  assert.ok(updatedBm.tags.includes('micro topic'));
});

test('batchAssignBookmarksToCollection and getUncollectedDomainStats', () => {
  const bm1 = createBookmark(OWNER, {
    url: 'https://github.com/torvalds/linux',
    title: 'Linux',
    metadataStatus: 'manual',
  });
  const bm2 = createBookmark(OWNER, {
    url: 'https://github.com/facebook/react',
    title: 'React',
    metadataStatus: 'manual',
  });

  const domains = getUncollectedDomainStats(OWNER, 10);
  const githubGroup = domains.find((d) => d.domain === 'github.com');
  assert.ok(githubGroup);
  assert.ok(githubGroup.count >= 2);
  assert.ok(githubGroup.bookmarkIds.includes(bm1.bookmark.id));
  assert.ok(githubGroup.bookmarkIds.includes(bm2.bookmark.id));

  const targetCol = createCollection(OWNER, { name: 'Code Repos' });
  const count = batchAssignBookmarksToCollection(OWNER, [bm1.bookmark.id, bm2.bookmark.id], targetCol.id);
  assert.equal(count, 2);

  const updatedBm1 = getBookmark(OWNER, bm1.bookmark.id)!;
  assert.equal(updatedBm1.collectionId, targetCol.id);
});

test('applyBatchCategorization creates collections, assigns bookmarks, and links tags', () => {
  const bm = createBookmark(OWNER, {
    url: 'https://news.ycombinator.com',
    title: 'Hacker News',
    metadataStatus: 'manual',
  });

  const result = applyBatchCategorization(OWNER, [
    {
      bookmarkId: bm.bookmark.id,
      collectionName: 'Tech News',
      tags: ['startups', 'tech'],
    },
  ]);

  assert.equal(result.applied, 1);

  const updated = getBookmark(OWNER, bm.bookmark.id)!;
  assert.ok(updated.collectionId);
  const col = getCollection(OWNER, updated.collectionId)!;
  assert.equal(col.name, 'Tech News');
  assert.ok(updated.tags.includes('startups'));
  assert.ok(updated.tags.includes('tech'));
});

test('mergeTags folds synonyms into one tag without duplicating links', () => {
  const first = createBookmark(OWNER, {
    url: 'https://llm.example/one',
    title: 'LLM one',
    tags: ['llm', 'llms'],
    metadataStatus: 'manual',
  }).bookmark;
  const second = createBookmark(OWNER, {
    url: 'https://llm.example/two',
    title: 'LLM two',
    tags: ['large language models'],
    metadataStatus: 'manual',
  }).bookmark;

  const names = new Map(listTags(OWNER).map((tag) => [tag.name, tag.id]));
  const sources = ['llms', 'large language models'].map((name) => names.get(name)!);

  const res = mergeTags(OWNER, sources, 'llm');

  assert.equal(res.merged, 2);
  // The first bookmark already carried "llm", so its "llms" link is dropped
  // rather than moved, and it must not end up with the tag twice.
  assert.deepEqual(getBookmark(OWNER, first.id)!.tags, ['llm']);
  assert.deepEqual(getBookmark(OWNER, second.id)!.tags, ['llm']);
  assert.ok(!listTags(OWNER).some((tag) => tag.name === 'llms'));
});

test('deleteTags removes tags and leaves their bookmarks alone', () => {
  const bookmark = createBookmark(OWNER, {
    url: 'https://junk.example',
    title: 'Junk',
    tags: ['keeper', 'one-off'],
    metadataStatus: 'manual',
  }).bookmark;

  const junkId = listTags(OWNER).find((tag) => tag.name === 'one-off')!.id;
  assert.equal(deleteTags(OWNER, [junkId]), 1);

  const updated = getBookmark(OWNER, bookmark.id)!;
  assert.deepEqual(updated.tags, ['keeper']);
  assert.equal(updated.title, 'Junk');
});
