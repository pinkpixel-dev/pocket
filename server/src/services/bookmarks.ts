import { db } from '../db/index.js';
import type { Bookmark, BookmarkQuery, BookmarkRow, MetadataStatus, SortKey } from '../lib/types.js';
import { domainOf, normalizeUrl, parseUrl } from '../lib/url.js';
import { probeUrl } from '../lib/http.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
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
    previewUrl: mediaUrl(row.cover_path ?? row.preview_path),
    coverUrl: mediaUrl(row.cover_path),
    collectionId: row.collection_id,
    isPinned: row.is_pinned === 1,
    tags: (tagsFor.all(row.id) as Array<{ name: string }>).map((tag) => tag.name),
    metadataStatus: row.metadata_status,
    metadataError: row.metadata_error,
    metadataFetchedAt: row.metadata_fetched_at,
    aiStatus: row.ai_status,
    aiError: row.ai_error,
    aiAppliedAt: row.ai_applied_at,
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

export function listBookmarks(userId: number, query: BookmarkQuery = {}): BookmarkPage {
  // Every other clause is optional. This one is not, which is why it is not
  // pushed onto the array with the rest.
  const where: string[] = ['b.user_id = @userId'];
  const params: Record<string, unknown> = { userId };

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

  if (query.status) {
    where.push('b.metadata_status = @status');
    params.status = query.status;
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

  const clause = `WHERE ${where.join(' AND ')}`;
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

export function getBookmarkRow(userId: number, id: number): BookmarkRow | undefined {
  return db.prepare('SELECT * FROM bookmarks WHERE id = ? AND user_id = ?').get(id, userId) as
    | BookmarkRow
    | undefined;
}

export function getBookmark(userId: number, id: number): Bookmark {
  const row = getBookmarkRow(userId, id);
  if (!row) throw notFound('That bookmark no longer exists.');
  return mapBookmark(row);
}

export function findByNormalizedUrl(userId: number, normalized: string): Bookmark | undefined {
  const row = db
    .prepare('SELECT * FROM bookmarks WHERE user_id = ? AND normalized_url = ?')
    .get(userId, normalized) as BookmarkRow | undefined;
  return row ? mapBookmark(row) : undefined;
}

/**
 * A collection id arrives from the browser, so it is checked against the same
 * account rather than trusted. Otherwise one person could file a link into
 * someone else's collection by guessing a number.
 */
function ownedCollectionId(userId: number, collectionId: number | null | undefined): number | null {
  if (collectionId === null || collectionId === undefined) return null;
  const row = db
    .prepare('SELECT id FROM collections WHERE id = ? AND user_id = ?')
    .get(collectionId, userId) as { id: number } | undefined;
  if (!row) throw badRequest('That collection is not in your library.');
  return row.id;
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

export function createBookmark(userId: number, input: CreateBookmarkInput): CreateResult {
  const url = parseUrl(input.url);
  const normalized = normalizeUrl(url);

  const existing = findByNormalizedUrl(userId, normalized);
  if (existing) return { bookmark: existing, created: false, duplicateOf: existing };

  const collectionId = ownedCollectionId(userId, input.collectionId);
  const title = input.title?.trim().slice(0, 300) ?? '';
  const status: MetadataStatus = input.metadataStatus ?? 'pending';

  const id = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO bookmarks (user_id, url, normalized_url, title, description, site_name,
                                collection_id, is_pinned, metadata_status, created_at, updated_at)
         VALUES (@userId, @url, @normalized, @title, @description, @siteName,
                 @collectionId, @isPinned, @status, @createdAt, datetime('now'))`,
      )
      .run({
        userId,
        url: url.href,
        normalized,
        title,
        description: input.description?.trim().slice(0, 600) ?? '',
        siteName: domainOf(url.href),
        collectionId,
        isPinned: input.isPinned ? 1 : 0,
        status,
        createdAt: input.createdAt ?? new Date().toISOString().replace('T', ' ').slice(0, 19),
      });

    const newId = Number(result.lastInsertRowid);
    const tags = parseTagInput(input.tags);
    if (tags.length) setBookmarkTags(userId, newId, tags);
    return newId;
  })();

  return { bookmark: getBookmark(userId, id), created: true };
}

export interface UpdateBookmarkInput {
  url?: string;
  title?: string;
  description?: string;
  collectionId?: number | null;
  tags?: string[] | string;
  isPinned?: boolean;
}

export function updateBookmark(userId: number, id: number, input: UpdateBookmarkInput): Bookmark {
  const row = getBookmarkRow(userId, id);
  if (!row) throw notFound('That bookmark no longer exists.');

  const fields: string[] = [];
  const params: Record<string, unknown> = { id, userId };

  if (input.url !== undefined) {
    const url = parseUrl(input.url);
    const normalized = normalizeUrl(url);
    if (normalized !== row.normalized_url) {
      const clash = findByNormalizedUrl(userId, normalized);
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
    params.collectionId = ownedCollectionId(userId, input.collectionId);
  }
  if (input.isPinned !== undefined) {
    fields.push('is_pinned = @isPinned');
    params.isPinned = input.isPinned ? 1 : 0;
  }

  db.transaction(() => {
    if (fields.length) {
      db.prepare(
        `UPDATE bookmarks SET ${fields.join(', ')}, updated_at = datetime('now')
          WHERE id = @id AND user_id = @userId`,
      ).run(params);
    }
    if (input.tags !== undefined) {
      setBookmarkTags(userId, id, parseTagInput(input.tags));
      pruneOrphanTags(userId);
    }
  })();

  return getBookmark(userId, id);
}

/**
 * Content-addressed files are shared, so only delete one nothing else uses.
 * The count deliberately spans every account: two people who saved the same
 * page share one preview file on disk, and one of them deleting their copy
 * must not blank the other's card.
 */
export async function releaseImage(relativePath: string | null, ignoreBookmarkId: number): Promise<void> {
  if (!relativePath) return;
  const { count } = db
    .prepare(
      `SELECT COUNT(*) AS count FROM bookmarks
        WHERE id != ? AND (preview_path = ? OR favicon_path = ? OR cover_path = ?)`,
    )
    .get(ignoreBookmarkId, relativePath, relativePath, relativePath) as { count: number };
  if (count === 0) await removeCachedImage(relativePath);
}

export async function deleteBookmark(userId: number, id: number): Promise<void> {
  const row = getBookmarkRow(userId, id);
  if (!row) throw notFound('That bookmark no longer exists.');

  await releaseImage(row.preview_path, id);
  await releaseImage(row.favicon_path, id);
  await releaseImage(row.cover_path, id);

  db.transaction(() => {
    db.prepare('DELETE FROM bookmarks WHERE id = ? AND user_id = ?').run(id, userId);
    pruneOrphanTags(userId);
  })();
}

/**
 * Deletes many bookmarks in one pass, which is what tidying up after an import
 * needs. The rows go first so the shared-image check below sees only what
 * survived; releasing per row before the delete would keep every file that two
 * doomed bookmarks happened to share.
 */
export async function deleteBookmarks(userId: number, ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;

  const rows = ids
    .map((id) => getBookmarkRow(userId, id))
    .filter((row): row is BookmarkRow => row !== undefined);

  const deleted = db.transaction(() => {
    const stmt = db.prepare('DELETE FROM bookmarks WHERE id = ? AND user_id = ?');
    let count = 0;
    for (const row of rows) count += stmt.run(row.id, userId).changes;
    pruneOrphanTags(userId);
    return count;
  })();

  for (const row of rows) {
    await releaseImage(row.preview_path, row.id);
    await releaseImage(row.favicon_path, row.id);
    await releaseImage(row.cover_path, row.id);
  }

  return deleted;
}

export function setPinned(userId: number, id: number, isPinned: boolean): Bookmark {
  const result = db
    .prepare(
      "UPDATE bookmarks SET is_pinned = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
    )
    .run(isPinned ? 1 : 0, id, userId);
  if (result.changes === 0) throw notFound('That bookmark no longer exists.');
  return getBookmark(userId, id);
}

export function countBookmarks(userId: number): number {
  return (
    db.prepare('SELECT COUNT(*) AS count FROM bookmarks WHERE user_id = ?').get(userId) as {
      count: number;
    }
  ).count;
}

/**
 * Dismisses a broken link warning by restoring metadata_status to 'ok'
 * (if a preview exists) or 'manual', and clearing metadata_error.
 */
export function dismissBroken(userId: number, id: number): Bookmark {
  const row = getBookmarkRow(userId, id);
  if (!row) throw notFound('That bookmark no longer exists.');

  const restoredStatus: MetadataStatus = row.preview_path ? 'ok' : 'manual';
  const result = db
    .prepare(
      `UPDATE bookmarks
          SET metadata_status = ?,
              metadata_error = NULL,
              updated_at = datetime('now')
        WHERE id = ? AND user_id = ?`,
    )
    .run(restoredStatus, id, userId);

  if (result.changes === 0) throw notFound('That bookmark no longer exists.');
  return getBookmark(userId, id);
}

/**
 * Dismisses broken link warnings in bulk, clearing metadata_error and restoring
 * status to 'ok' or 'manual' in a single transaction.
 */
export function dismissBrokenBulk(userId: number, ids: number[]): number {
  if (ids.length === 0) return 0;

  return db.transaction(() => {
    const stmt = db.prepare(
      `UPDATE bookmarks
          SET metadata_status = CASE WHEN preview_path IS NOT NULL THEN 'ok' ELSE 'manual' END,
              metadata_error = NULL,
              updated_at = datetime('now')
        WHERE id = ? AND user_id = ?`,
    );
    let count = 0;
    for (const id of ids) {
      count += stmt.run(id, userId).changes;
    }
    return count;
  })();
}

/**
 * Checks a single bookmark's link health using probeUrl, updating its status
 * if it has recovered or is confirmed dead, and returning the fresh bookmark.
 */
export async function probeSingleBookmark(userId: number, id: number): Promise<Bookmark> {
  const row = getBookmarkRow(userId, id);
  if (!row) throw notFound('That bookmark no longer exists.');

  const probe = await probeUrl(row.url);
  if (probe.verdict === 'dead') {
    const errorMsg = (probe.error ?? 'Link unreachable').slice(0, 400);
    db.prepare(
      `UPDATE bookmarks
          SET metadata_status = 'failed',
              metadata_error = ?,
              metadata_fetched_at = datetime('now'),
              updated_at = datetime('now')
        WHERE id = ? AND user_id = ?`,
    ).run(errorMsg, id, userId);
  } else if (probe.verdict === 'alive' && row.metadata_status === 'failed') {
    const restoredStatus: MetadataStatus = row.preview_path ? 'ok' : 'manual';
    db.prepare(
      `UPDATE bookmarks
          SET metadata_status = ?,
              metadata_error = NULL,
              metadata_fetched_at = datetime('now'),
              updated_at = datetime('now')
        WHERE id = ? AND user_id = ?`,
    ).run(restoredStatus, id, userId);
  }

  return getBookmark(userId, id);
}

