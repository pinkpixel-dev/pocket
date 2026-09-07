import { db } from '../db/index.js';
import type { Collection } from '../lib/types.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { ensureTagIds, normalizeTagName } from './tags.js';

const COLLECTION_SELECT = `
  SELECT c.id, c.name, c.description, c.color, c.position, c.created_at AS createdAt,
         (SELECT COUNT(*) FROM bookmarks b WHERE b.collection_id = c.id) AS bookmarkCount
    FROM collections c`;

export function listCollections(userId: number): Collection[] {
  return db
    .prepare(`${COLLECTION_SELECT} WHERE c.user_id = ? ORDER BY c.position ASC, c.name ASC`)
    .all(userId) as Collection[];
}

export function getCollection(userId: number, id: number): Collection | undefined {
  return db.prepare(`${COLLECTION_SELECT} WHERE c.id = ? AND c.user_id = ?`).get(id, userId) as
    | Collection
    | undefined;
}

function cleanName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!name) throw badRequest('A collection needs a name.');
  return name;
}

export interface CollectionInput {
  name: string;
  description?: string | null;
  color?: string | null;
}

export function createCollection(userId: number, input: CollectionInput): Collection {
  const name = cleanName(input.name);
  const nextPosition =
    (
      db.prepare('SELECT COALESCE(MAX(position), 0) AS max FROM collections WHERE user_id = ?').get(userId) as {
        max: number;
      }
    ).max + 1;

  try {
    const result = db
      .prepare('INSERT INTO collections (user_id, name, description, color, position) VALUES (?, ?, ?, ?, ?)')
      .run(userId, name, input.description?.trim() || null, input.color || null, nextPosition);
    return getCollection(userId, Number(result.lastInsertRowid))!;
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) {
      throw conflict(`A collection named "${name}" already exists.`);
    }
    throw error;
  }
}

export function updateCollection(
  userId: number,
  id: number,
  input: Partial<CollectionInput>,
): Collection {
  const existing = getCollection(userId, id);
  if (!existing) throw notFound('That collection no longer exists.');

  const name = input.name === undefined ? existing.name : cleanName(input.name);
  const description =
    input.description === undefined ? existing.description : input.description?.trim() || null;
  const color = input.color === undefined ? existing.color : input.color || null;

  try {
    db.prepare('UPDATE collections SET name = ?, description = ?, color = ? WHERE id = ? AND user_id = ?').run(
      name,
      description,
      color,
      id,
      userId,
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) {
      throw conflict(`A collection named "${name}" already exists.`);
    }
    throw error;
  }
  return getCollection(userId, id)!;
}

/** Bookmarks survive; they just fall back to being uncollected. */
export function deleteCollection(userId: number, id: number): void {
  const result = db.prepare('DELETE FROM collections WHERE id = ? AND user_id = ?').run(id, userId);
  if (result.changes === 0) throw notFound('That collection no longer exists.');
}

export function findCollectionByName(userId: number, name: string): Collection | undefined {
  return db
    .prepare(`${COLLECTION_SELECT} WHERE c.user_id = ? AND c.name = ? COLLATE NOCASE`)
    .get(userId, name.trim()) as Collection | undefined;
}

export function ensureCollection(userId: number, name: string): Collection {
  return findCollectionByName(userId, name) ?? createCollection(userId, { name });
}

const linkTagStmt = db.prepare('INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?)');

export interface MergeOptions {
  /**
   * Keeps each source collection's name as a tag on the bookmarks it held.
   * Folding "AI music" into "AI" loses the word "music" otherwise.
   */
  tagWithSourceNames?: boolean;
}

export function mergeCollections(
  userId: number,
  sourceIds: number[],
  targetId: number,
  options: MergeOptions = {},
): { movedCount: number; deletedCollections: number; taggedCount: number } {
  const target = getCollection(userId, targetId);
  if (!target) throw notFound('Target collection not found.');

  const validSources = sourceIds.filter((id) => id !== targetId);
  if (validSources.length === 0) return { movedCount: 0, deletedCollections: 0, taggedCount: 0 };

  return db.transaction(() => {
    let movedCount = 0;
    let taggedCount = 0;
    let deletedCollections = 0;
    const selectBookmarks = db.prepare('SELECT id FROM bookmarks WHERE collection_id = ? AND user_id = ?');
    const moveStmt = db.prepare(
      "UPDATE bookmarks SET collection_id = ?, updated_at = datetime('now') WHERE collection_id = ? AND user_id = ?",
    );
    const deleteStmt = db.prepare('DELETE FROM collections WHERE id = ? AND user_id = ?');

    for (const srcId of validSources) {
      const source = getCollection(userId, srcId);
      if (!source) continue;

      if (options.tagWithSourceNames) {
        const tagName = normalizeTagName(source.name);
        if (tagName) {
          const tagId = ensureTagIds(userId, [tagName])[0];
          if (tagId) {
            // Tagging happens before the move, while the bookmarks can still
            // be found by the collection they are leaving.
            for (const row of selectBookmarks.all(srcId, userId) as Array<{ id: number }>) {
              linkTagStmt.run(row.id, tagId);
              taggedCount += 1;
            }
          }
        }
      }

      const updateResult = moveStmt.run(targetId, srcId, userId);
      movedCount += updateResult.changes;
      deletedCollections += deleteStmt.run(srcId, userId).changes;
    }

    return { movedCount, deletedCollections, taggedCount };
  })();
}

export function convertCollectionsToTags(
  userId: number,
  collectionIds: number[],
): { converted: number; bookmarksTagged: number } {
  if (collectionIds.length === 0) return { converted: 0, bookmarksTagged: 0 };

  return db.transaction(() => {
    let converted = 0;
    let bookmarksTagged = 0;
    const selectBookmarks = db.prepare('SELECT id FROM bookmarks WHERE collection_id = ? AND user_id = ?');
    const deleteStmt = db.prepare('DELETE FROM collections WHERE id = ? AND user_id = ?');

    for (const id of collectionIds) {
      const col = getCollection(userId, id);
      if (!col) continue;

      const tagName = normalizeTagName(col.name);
      if (tagName) {
        const tagId = ensureTagIds(userId, [tagName])[0];
        if (tagId) {
          const rows = selectBookmarks.all(id, userId) as Array<{ id: number }>;
          for (const row of rows) {
            linkTagStmt.run(row.id, tagId);
            bookmarksTagged += 1;
          }
        }
      }

      deleteStmt.run(id, userId);
      converted += 1;
    }

    return { converted, bookmarksTagged };
  })();
}

export function batchAssignBookmarksToCollection(
  userId: number,
  bookmarkIds: number[],
  collectionId: number | null,
): number {
  if (bookmarkIds.length === 0) return 0;
  if (collectionId !== null && !getCollection(userId, collectionId)) {
    throw notFound('Target collection not found.');
  }

  return db.transaction(() => {
    const stmt = db.prepare(
      "UPDATE bookmarks SET collection_id = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
    );
    let count = 0;
    for (const id of bookmarkIds) {
      const res = stmt.run(collectionId, id, userId);
      count += res.changes;
    }
    return count;
  })();
}

export interface UncollectedDomainGroup {
  domain: string;
  count: number;
  bookmarkIds: number[];
}

export function countUncollectedBookmarks(userId: number): number {
  return (
    db
      .prepare('SELECT COUNT(*) AS count FROM bookmarks WHERE user_id = ? AND collection_id IS NULL')
      .get(userId) as { count: number }
  ).count;
}

export function getUncollectedDomainStats(userId: number, limit = 25): UncollectedDomainGroup[] {
  const domainRows = db
    .prepare(
      `SELECT site_name AS domain, COUNT(*) AS count
         FROM bookmarks
        WHERE user_id = ? AND collection_id IS NULL AND site_name != ''
        GROUP BY site_name
        ORDER BY count DESC
        LIMIT ?`,
    )
    .all(userId, limit) as Array<{ domain: string; count: number }>;

  if (domainRows.length === 0) return [];

  const getIdsStmt = db.prepare(
    `SELECT id FROM bookmarks
      WHERE user_id = ? AND collection_id IS NULL AND site_name = ?
      ORDER BY id DESC`,
  );

  return domainRows.map((row) => ({
    domain: row.domain,
    count: row.count,
    bookmarkIds: (getIdsStmt.all(userId, row.domain) as Array<{ id: number }>).map((r) => r.id),
  }));
}
