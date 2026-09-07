import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Point data directory to a temporary directory before loading database
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pocket-test-'));
process.env.POCKET_DATA_DIR = tmpDir;
process.env.POCKET_BLOCK_PRIVATE_ADDRESSES = '0';

// Import services after setting environment variables
const { db } = await import('../db/index.js');
const { parseBookmarkHtml, importLinks } = await import('./transfer.js');
const { probeUrl } = await import('../lib/http.js');
const { startLibraryAudit, getAuditStatus } = await import('./audit.js');


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

test('parseBookmarkHtml extracts ADD_DATE and folders', () => {
  const sampleHtml = `
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>Tech</H3>
    <DL><p>
        <DT><A HREF="https://example.com/2024" ADD_DATE="1717156800">Example 2024</A>
        <DD>A link from June 2024</DD>
        <DT><A HREF="https://example.com/2021" ADD_DATE="1622548800">Example 2021</A>
        <DD>A link from June 2021</DD>
    </DL><p>
</DL><p>
`;

  const links = parseBookmarkHtml(sampleHtml);
  assert.equal(links.length, 2);
  assert.equal(links[0]!.title, 'Example 2024');
  assert.equal(links[0]!.collection, 'Tech');
  assert.ok(links[0]!.createdAt?.startsWith('2024-'));
  assert.ok(links[1]!.createdAt?.startsWith('2021-'));
});

test('importLinks filters by year correctly', async () => {
  const sampleLinks = [
    {
      url: 'https://site-2022.org',
      title: 'Site 2022',
      description: '',
      tags: [],
      collection: null,
      createdAt: '2022-05-10 12:00:00',
    },
    {
      url: 'https://site-2024.org',
      title: 'Site 2024',
      description: '',
      tags: [],
      collection: null,
      createdAt: '2024-08-15 12:00:00',
    },
    {
      url: 'https://site-2025.org',
      title: 'Site 2025',
      description: '',
      tags: [],
      collection: null,
      createdAt: '2025-01-20 12:00:00',
    },
  ];

  // Exact match 2024
  const summaryExact = await importLinks(OWNER, sampleLinks, {
    fetchMetadata: false,
    yearFilter: 2024,
    yearMode: 'exact',
  });

  assert.equal(summaryExact.imported, 1);
  assert.equal(summaryExact.yearFiltered, 2);

  // Since 2024 (should match 2024 and 2025, but 2024 is now duplicate)
  const summarySince = await importLinks(OWNER, sampleLinks, {
    fetchMetadata: false,
    yearFilter: 2024,
    yearMode: 'since',
  });

  assert.equal(summarySince.imported, 1); // 2025 imported
  assert.equal(summarySince.duplicates, 1); // 2024 already saved
  assert.equal(summarySince.yearFiltered, 1); // 2022 skipped
});

test('probeUrl handles unreachable URLs gracefully', async () => {
  // Domain that does not exist
  const result = await probeUrl('https://this-domain-surely-does-not-exist-123456789.org', 3000);
  assert.equal(result.alive, false);
  assert.ok(result.error !== null);
});

test('startLibraryAudit tracks status and completes', async () => {
  const initial = startLibraryAudit(OWNER);
  assert.equal(typeof initial.running, 'boolean');

  // Wait a moment for background worker to process the 2 test links in DB
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const status = getAuditStatus(OWNER);
  assert.equal(typeof status.total, 'number');
  assert.equal(typeof status.checked, 'number');
  assert.equal(typeof status.broken, 'number');
});
