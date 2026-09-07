import * as cheerio from 'cheerio';
import { db } from '../db/index.js';
import type { BookmarkRow } from '../lib/types.js';
import { createBookmark } from './bookmarks.js';
import { ensureCollection, listCollections } from './collections.js';
import { listTags, parseTagInput } from './tags.js';
import { enqueueEnrich } from './queue.js';
import { getAuditStatus, startLibraryAudit } from './audit.js';

export interface ImportSummary {
  imported: number;
  duplicates: number;
  skipped: number;
  yearFiltered: number;
  collectionsCreated: number;
  /** How many freshly imported links a background check will read. */
  checkingLinks: number;
  errors: string[];
}

export interface ImportOptions {
  fetchMetadata: boolean;
  /** Reads every imported link afterwards and flags the ones that are gone. */
  checkLinks?: boolean;
  yearFilter?: number;
  yearMode?: 'exact' | 'since' | 'before';
  folderStrategy?: 'hierarchy' | 'tags_only';
  defaultCollection?: string;
}

export interface ParsedLink {
  url: string;
  title: string;
  description: string;
  tags: string[];
  collection: string | null;
  folderPath?: string[];
  createdAt?: string;
  isPinned?: boolean;
}

function toSqliteDate(value: string | number | undefined): string | undefined {
  if (value === undefined || value === '') return undefined;
  const asNumber = typeof value === 'number' ? value : Number(value);
  const date = Number.isFinite(asNumber)
    ? new Date(asNumber > 1e11 ? asNumber : asNumber * 1000)
    : new Date(String(value));
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Reads the Netscape bookmark format exported by standard browsers.
 * Walks the enclosing folder hierarchy so caller can decide how to map
 * nested folders into collections and tags.
 */
export function parseBookmarkHtml(html: string): ParsedLink[] {
  const $ = cheerio.load(html);
  const links: ParsedLink[] = [];

  $('a[href]').each((_, element) => {
    const anchor = $(element);
    const href = anchor.attr('href')?.trim();
    if (!href || !/^https?:/i.test(href)) return;

    // Collect folder ancestry from outermost to innermost
    const folderPath: string[] = [];
    anchor.parents('dl').each((_, dlElem) => {
      const dl = $(dlElem);
      const heading =
        dl.prevAll('h3').first().text().trim() ||
        dl.parent().children('h3').first().text().trim() ||
        dl.parent().prevAll('h3').first().text().trim();
      if (
        heading &&
        !/^(bookmarks(\s+(bar|menu|toolbar))?|other bookmarks|favorites|mobile bookmarks)$/i.test(
          heading,
        )
      ) {
        folderPath.push(heading.slice(0, 80));
      }
    });
    folderPath.reverse();

    const description = anchor.parent().next('dd').text().trim();

    links.push({
      url: href,
      title: anchor.text().replace(/\s+/g, ' ').trim(),
      description: description.slice(0, 600),
      tags: parseTagInput(anchor.attr('tags')),
      collection: folderPath.length > 0 ? (folderPath[folderPath.length - 1] ?? null) : null,
      folderPath,
      createdAt: toSqliteDate(anchor.attr('add_date')),
    });
  });

  return links;
}

export async function importLinks(
  userId: number,
  links: ParsedLink[],
  options: ImportOptions,
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    imported: 0,
    duplicates: 0,
    skipped: 0,
    yearFiltered: 0,
    collectionsCreated: 0,
    checkingLinks: 0,
    errors: [],
  };

  // Year filter
  let candidates = links;
  if (options.yearFilter !== undefined && Number.isFinite(options.yearFilter)) {
    const filtered: ParsedLink[] = [];
    for (const link of links) {
      if (!link.createdAt) {
        summary.yearFiltered += 1;
        continue;
      }
      const linkYear = parseInt(link.createdAt.slice(0, 4), 10);
      if (Number.isNaN(linkYear)) {
        summary.yearFiltered += 1;
        continue;
      }
      const match =
        options.yearMode === 'since'
          ? linkYear >= options.yearFilter
          : options.yearMode === 'before'
            ? linkYear < options.yearFilter
            : linkYear === options.yearFilter;

      if (match) {
        filtered.push(link);
      } else {
        summary.yearFiltered += 1;
      }
    }
    candidates = filtered;
  }

  const collectionIds = new Map<string, number>();
  const existingNames = new Set(
    listCollections(userId).map((collection) => collection.name.toLowerCase()),
  );
  const queue: number[] = [];
  const importedIds: number[] = [];

  for (const link of candidates) {
    try {
      let targetCollectionName: string | null = null;
      const extraTags: string[] = [];
      const strategy = options.folderStrategy || 'hierarchy';

      const path = link.folderPath ?? [];
      if (strategy === 'tags_only') {
        targetCollectionName = options.defaultCollection?.trim() || null;
        extraTags.push(...path);
      } else {
        // 'hierarchy' (default)
        if (path.length > 0) {
          targetCollectionName = path[0] ?? null;
          if (path.length > 1) {
            extraTags.push(...path.slice(1));
          }
        } else if (options.defaultCollection?.trim()) {
          targetCollectionName = options.defaultCollection.trim();
        }
      }

      let collectionId: number | null = null;
      if (targetCollectionName) {
        const key = targetCollectionName.toLowerCase();
        if (!collectionIds.has(key)) {
          const collection = ensureCollection(userId, targetCollectionName);
          collectionIds.set(key, collection.id);
          if (!existingNames.has(key)) {
            existingNames.add(key);
            summary.collectionsCreated += 1;
          }
        }
        collectionId = collectionIds.get(key) ?? null;
      }

      const combinedTags = Array.from(
        new Set([
          ...link.tags,
          ...extraTags.map((t) => t.trim()).filter(Boolean),
        ]),
      );

      const result = createBookmark(userId, {
        url: link.url,
        title: link.title,
        description: link.description,
        collectionId,
        tags: combinedTags,
        isPinned: link.isPinned,
        createdAt: link.createdAt,
        metadataStatus: options.fetchMetadata ? 'pending' : 'manual',
      });

      if (!result.created) {
        summary.duplicates += 1;
        continue;
      }
      summary.imported += 1;
      importedIds.push(result.bookmark.id);
      if (options.fetchMetadata) queue.push(result.bookmark.id);
    } catch (error) {
      summary.skipped += 1;
      if (summary.errors.length < 20) {
        summary.errors.push(`${link.url}: ${error instanceof Error ? error.message : 'could not be imported'}`);
      }
    }
  }

  for (const id of queue) enqueueEnrich(userId, id, {}, false);

  /*
   * The check runs after the rows are written, never before them. Probing an
   * 11,000 link file first meant nothing at all was saved until every probe
   * finished, which is far longer than any browser or proxy holds a request
   * open, so the whole import came back empty.
   *
   * The metadata pass already fetches every page and marks the ones that fail,
   * so a second scan would only double the outbound requests and race it for
   * the status column. The scan is what provides the check when that is off.
   */
  if (options.checkLinks && importedIds.length > 0) {
    if (options.fetchMetadata) {
      // The metadata pass is already reading every one of these pages.
      summary.checkingLinks = importedIds.length;
    } else if (!getAuditStatus(userId).running) {
      startLibraryAudit(userId, { ids: importedIds });
      summary.checkingLinks = importedIds.length;
    }
  }

  return summary;
}

export interface PocketBackup {
  format: 'pocket-backup';
  version: 1;
  exportedAt: string;
  collections: Array<{ name: string; description: string | null; color: string | null }>;
  tags: string[];
  bookmarks: Array<{
    url: string;
    title: string;
    description: string;
    siteName: string;
    collection: string | null;
    tags: string[];
    isPinned: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
}

export function buildJsonBackup(userId: number): PocketBackup {
  const collections = listCollections(userId);
  const byId = new Map(collections.map((collection) => [collection.id, collection.name]));

  const rows = db
    .prepare('SELECT * FROM bookmarks WHERE user_id = ? ORDER BY created_at ASC')
    .all(userId) as BookmarkRow[];
  const tagsFor = db.prepare(
    `SELECT t.name FROM tags t JOIN bookmark_tags bt ON bt.tag_id = t.id
      WHERE bt.bookmark_id = ? ORDER BY t.name`,
  );

  return {
    format: 'pocket-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    collections: collections.map(({ name, description, color }) => ({ name, description, color })),
    tags: listTags(userId).map((tag) => tag.name),
    bookmarks: rows.map((row) => ({
      url: row.url,
      title: row.title,
      description: row.description,
      siteName: row.site_name,
      collection: row.collection_id ? (byId.get(row.collection_id) ?? null) : null,
      tags: (tagsFor.all(row.id) as Array<{ name: string }>).map((tag) => tag.name),
      isPinned: row.is_pinned === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}

export function linksFromBackup(backup: unknown): ParsedLink[] {
  if (typeof backup !== 'object' || backup === null) return [];
  const entries = (backup as { bookmarks?: unknown }).bookmarks;
  if (!Array.isArray(entries)) return [];

  const links: ParsedLink[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.url !== 'string') continue;

    const col = typeof record.collection === 'string' ? record.collection : null;
    links.push({
      url: record.url,
      title: typeof record.title === 'string' ? record.title : '',
      description: typeof record.description === 'string' ? record.description : '',
      tags: Array.isArray(record.tags) ? parseTagInput(record.tags.map(String)) : [],
      collection: col,
      folderPath: col ? [col] : [],
      createdAt: toSqliteDate(typeof record.createdAt === 'string' ? record.createdAt : undefined),
      isPinned: record.isPinned === true,
    });
  }
  return links;
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );

const toEpochSeconds = (value: string): number => {
  const parsed = Date.parse(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isNaN(parsed) ? Math.floor(Date.now() / 1000) : Math.floor(parsed / 1000);
};

/** Writes the Netscape format so the file imports cleanly into any browser. */
export function buildBookmarkHtml(userId: number): string {
  const backup = buildJsonBackup(userId);
  const grouped = new Map<string, PocketBackup['bookmarks']>();

  for (const bookmark of backup.bookmarks) {
    const key = bookmark.collection ?? '';
    const bucket = grouped.get(key);
    if (bucket) bucket.push(bookmark);
    else grouped.set(key, [bookmark]);
  }

  const renderLink = (bookmark: PocketBackup['bookmarks'][number], indent: string): string => {
    const attributes = [
      `HREF="${escapeHtml(bookmark.url)}"`,
      `ADD_DATE="${toEpochSeconds(bookmark.createdAt)}"`,
      `LAST_MODIFIED="${toEpochSeconds(bookmark.updatedAt)}"`,
    ];
    if (bookmark.tags.length) attributes.push(`TAGS="${escapeHtml(bookmark.tags.join(','))}"`);

    const title = escapeHtml(bookmark.title || bookmark.url);
    const line = `${indent}<DT><A ${attributes.join(' ')}>${title}</A>`;
    return bookmark.description ? `${line}\n${indent}<DD>${escapeHtml(bookmark.description)}` : line;
  };

  const lines: string[] = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file. It will be read and overwritten. -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];

  for (const bookmark of grouped.get('') ?? []) lines.push(renderLink(bookmark, '    '));

  for (const [name, bookmarks] of grouped) {
    if (!name) continue;
    lines.push(`    <DT><H3>${escapeHtml(name)}</H3>`, '    <DL><p>');
    for (const bookmark of bookmarks) lines.push(renderLink(bookmark, '        '));
    lines.push('    </DL><p>');
  }

  lines.push('</DL><p>', '');
  return lines.join('\n');
}
