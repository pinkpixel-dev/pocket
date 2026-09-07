import { db } from '../db/index.js';
import type { Bookmark, BookmarkQuery, BookmarkRow, MetadataStatus, SortKey } from '../lib/types.js';
import { domainOf, normalizeUrl, parseUrl } from '../lib/url.js';
import { conflict, notFound } from '../lib/errors.js';
import { removeCachedImage } from './images.js';
import { parseTagInput, pruneOrphanTags, setBookmarkTags } from './tags.js';

const mediaUrl = (relativePath: string | null): string | null =>
  relativePath ? `/media/${relativePath}` : null;

const tagsFor = db.prepare(
  `SELECT t.name FROM tags t
     JOIN bookmark_tags bt ON bt.tag_id = t.id
    WHERE bt.bookmark_id = ?
    ORDER BY t.name ASC`,
);

export function mapBookmark(row: BookmarkRow): Bookmark {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    description: row.description,
    siteName: row.site_name,
    domain: domainOf(row.url),
    faviconUrl: mediaUrl(row.favicon_path),
    previewUrl: mediaUrl(row.preview_path),
    collectionId: row.collection_id,
    isPinned: row.is_pinned === 1,
    tags: (tagsFor.all(row.id) as Array<{ name: string }>).map((tag) => tag.name),
    metadataStatus: row.metadata_status,
    metadataError: row.metadata_error,
    metadataFetchedAt: row.metadata_fetched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ORDER_BY: Record<SortKey, string> = {
  newest: 'b.created_at DESC, b.id DESC',
  oldest: 'b.created_at ASC, b.id ASC',
  title: "CASE WHEN b.title = '' THEN 1 ELSE 0 END, b.title COLLATE NOCASE ASC",
  domain: 'b.site_name COLLATE NOCASE ASC, b.title COLLATE NOCASE ASC',
  updated: 'b.updated_at DESC, b.id DESC',
};

export interface BookmarkPage {
  items: Bookmark[];
  total: number;
}

export function listBookmarks(query: BookmarkQuery = {}): BookmarkPage {
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (query.pinned) where.push('b.is_pinned = 1');
  if (query.uncollected) where.push('b.collection_id IS NULL');
  else if (query.collectionId != null) {
    where.push('b.collection_id = @collectionId');
    params.collectionId = query.collectionId;
  }

  if (query.untagged) {
    where.push('NOT EXISTS (SELECT 1 FROM bookmark_tags bt WHERE bt.bookmark_id = b.id)');
  } else if (query.tag) {
    where.push(
      `EXISTS (SELECT 1 FROM bookmark_tags bt JOIN tags t ON t.id = bt.tag_id
                WHERE bt.bookmark_id = b.id AND t.name = @tag COLLATE NOCASE)`,
    );
    params.tag = query.tag;
  }

  const search = query.search?.trim();
  if (search) {
    where.push(
      `(b.title LIKE @search ESCAPE '\\'
        OR b.url LIKE @search ESCAPE '\\'
        OR b.description LIKE @search ESCAPE '\\'
        OR b.site_name LIKE @search ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM bookmark_tags bt JOIN tags t ON t.id = bt.tag_id
                    WHERE bt.bookmark_id = b.id AND t.name LIKE @search ESCAPE '\\'))`,
    );
    params.search = `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (
    db.prepare(`SELECT COUNT(*) AS count FROM bookmarks b ${clause}`).get(params) as { count: number }
  ).count;

  const limit = Math.min(Math.max(query.limit ?? 200, 1), 500);
  const offset = Math.max(query.offset ?? 0, 0);
  // Pinned bookmarks float to the top of every view except the pinned view itself.
  const pinnedFirst = query.pinned ? '' : 'b.is_pinned DESC, ';
  const order = ORDER_BY[query.sort ?? 'newest'];

  const rows = db
    .prepare(
      `SELECT b.* FROM bookmarks b ${clause}
        ORDER BY ${pinnedFirst}${order}
        LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit, offset }) as BookmarkRow[];

  return { items: rows.map(mapBookmark), total };
}

export function getBookmarkRow(id: number): BookmarkRow | undefined {
  return db.prepare('SELECT * FROM bookmarks WHERE id = ?').get(id) as BookmarkRow | undefined;
}

export function getBookmark(id: number): Bookmark {
  const row = getBookmarkRow(id);
  if (!row) throw notFound('That bookmark no longer exists.');
  return mapBookmark(row);
}

export function findByNormalizedUrl(normalized: string): Bookmark | undefined {
  const row = db.prepare('SELECT * FROM bookmarks WHERE normalized_url = ?').get(normalized) as
    | BookmarkRow
    | undefined;
  return row ? mapBookmark(row) : undefined;
}

export interface CreateBookmarkInput {
  url: string;
  title?: string;
  description?: string;
  collectionId?: number | null;
  tags?: string[] | string;
  isPinned?: boolean;
  createdAt?: string;
  /** Skips the background fetch, used by imports that already carry titles. */
  metadataStatus?: MetadataStatus;
}

export interface CreateResult {
  bookmark: Bookmark;
  created: boolean;
  duplicateOf?: Bookmark;
}

export function createBookmark(input: CreateBookmarkInput): CreateResult {
  const url = parseUrl(input.url);
  const normalized = normalizeUrl(url);

  const existing = findByNormalizedUrl(normalized);
  if (existing) return { bookmark: existing, created: false, duplicateOf: existing };

  const title = input.title?.trim().slice(0, 300) ?? '';
  const status: MetadataStatus = input.metadataStatus ?? 'pending';

  const id = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO bookmarks (url, normalized_url, title, description, site_name,
                                collection_id, is_pinned, metadata_status, created_at, updated_at)
         VALUES (@url, @normalized, @title, @description, @siteName,
                 @collectionId, @isPinned, @status, @createdAt, datetime('now'))`,
      )
      .run({
        url: url.href,
        normalized,
        title,
        description: input.description?.trim().slice(0, 600) ?? '',
        siteName: domainOf(url.href),
        collectionId: input.collectionId ?? null,
        isPinned: input.isPinned ? 1 : 0,
        status,
        createdAt: input.createdAt ?? new Date().toISOString().replace('T', ' ').slice(0, 19),
      });

    const newId = Number(result.lastInsertRowid);
    const tags = parseTagInput(input.tags);
    if (tags.length) setBookmarkTags(newId, tags);
    return newId;
  })();

  return { bookmark: getBookmark(id), created: true };
}

export interface UpdateBookmarkInput {
  url?: string;
  title?: string;
  description?: string;
  collectionId?: number | null;
  tags?: string[] | string;
  isPinned?: boolean;
}

export function updateBookmark(id: number, input: UpdateBookmarkInput): Bookmark {
  const row = getBookmarkRow(id);
  if (!row) throw notFound('That bookmark no longer exists.');

  const fields: string[] = [];
  const params: Record<string, unknown> = { id };

  if (input.url !== undefined) {
    const url = parseUrl(input.url);
    const normalized = normalizeUrl(url);
    if (normalized !== row.normalized_url) {
      const clash = findByNormalizedUrl(normalized);
      if (clash) throw conflict('Another bookmark already points at that URL.', { bookmark: clash });
      fields.push('normalized_url = @normalized', 'site_name = @siteName');
      params.normalized = normalized;
      params.siteName = domainOf(url.href);
    }
    fields.push('url = @url');
    params.url = url.href;
  }

  if (input.title !== undefined) {
    fields.push('title = @title');
    params.title = input.title.trim().slice(0, 300);
  }
  if (input.description !== undefined) {
    fields.push('description = @description');
    params.description = input.description.trim().slice(0, 600);
  }
  if (input.collectionId !== undefined) {
    fields.push('collection_id = @collectionId');
    params.collectionId = input.collectionId;
  }
  if (input.isPinned !== undefined) {
    fields.push('is_pinned = @isPinned');
    params.isPinned = input.isPinned ? 1 : 0;
  }

  db.transaction(() => {
    if (fields.length) {
      db.prepare(`UPDATE bookmarks SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = @id`).run(
        params,
      );
    }
    if (input.tags !== undefined) {
      setBookmarkTags(id, parseTagInput(input.tags));
      pruneOrphanTags();
    }
  })();

  return getBookmark(id);
}

/** Content-addressed files are shared, so only delete one nothing else uses. */
async function releaseImage(relativePath: string | null, ignoreBookmarkId: number): Promise<void> {
  if (!relativePath) return;
  const { count } = db
    .prepare(
      `SELECT COUNT(*) AS count FROM bookmarks
        WHERE id != ? AND (preview_path = ? OR favicon_path = ?)`,
    )
    .get(ignoreBookmarkId, relativePath, relativePath) as { count: number };
  if (count === 0) await removeCachedImage(relativePath);
}

export async function deleteBookmark(id: number): Promise<void> {
  const row = getBookmarkRow(id);
  if (!row) throw notFound('That bookmark no longer exists.');

  await releaseImage(row.preview_path, id);
  await releaseImage(row.favicon_path, id);

  db.transaction(() => {
    db.prepare('DELETE FROM bookmarks WHERE id = ?').run(id);
    pruneOrphanTags();
  })();
}

export function setPinned(id: number, isPinned: boolean): Bookmark {
  const result = db
    .prepare("UPDATE bookmarks SET is_pinned = ?, updated_at = datetime('now') WHERE id = ?")
    .run(isPinned ? 1 : 0, id);
  if (result.changes === 0) throw notFound('That bookmark no longer exists.');
  return getBookmark(id);
}

export function countBookmarks(): number {
  return (db.prepare('SELECT COUNT(*) AS count FROM bookmarks').get() as { count: number }).count;
}
