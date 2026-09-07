import { db } from '../db/index.js';
import type { Collection } from '../lib/types.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { ensureTagIds, normalizeTagName } from './tags.js';

const COLLECTION_SELECT = `
  SELECT c.id, c.name, c.description, c.color, c.position, c.created_at AS createdAt,
         (SELECT COUNT(*) FROM bookmarks b WHERE b.collection_id = c.id) AS bookmarkCount
    FROM collections c`;

export function listCollections(): Collection[] {
  return db.prepare(`${COLLECTION_SELECT} ORDER BY c.position ASC, c.name ASC`).all() as Collection[];
}

export function getCollection(id: number): Collection | undefined {
  return db.prepare(`${COLLECTION_SELECT} WHERE c.id = ?`).get(id) as Collection | undefined;
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

export function createCollection(input: CollectionInput): Collection {
  const name = cleanName(input.name);
  const nextPosition =
    (db.prepare('SELECT COALESCE(MAX(position), 0) AS max FROM collections').get() as { max: number }).max + 1;

  try {
    const result = db
      .prepare('INSERT INTO collections (name, description, color, position) VALUES (?, ?, ?, ?)')
      .run(name, input.description?.trim() || null, input.color || null, nextPosition);
    return getCollection(Number(result.lastInsertRowid))!;
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) {
      throw conflict(`A collection named "${name}" already exists.`);
    }
    throw error;
  }
}

export function updateCollection(id: number, input: Partial<CollectionInput>): Collection {
  const existing = getCollection(id);
  if (!existing) throw notFound('That collection no longer exists.');

  const name = input.name === undefined ? existing.name : cleanName(input.name);
  const description =
    input.description === undefined ? existing.description : input.description?.trim() || null;
  const color = input.color === undefined ? existing.color : input.color || null;

  try {
    db.prepare('UPDATE collections SET name = ?, description = ?, color = ? WHERE id = ?').run(
      name,
      description,
      color,
      id,
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) {
      throw conflict(`A collection named "${name}" already exists.`);
    }
    throw error;
  }
  return getCollection(id)!;
}

/** Bookmarks survive; they just fall back to being uncollected. */
export function deleteCollection(id: number): void {
  const result = db.prepare('DELETE FROM collections WHERE id = ?').run(id);
  if (result.changes === 0) throw notFound('That collection no longer exists.');
}

export function findCollectionByName(name: string): Collection | undefined {
  return db.prepare(`${COLLECTION_SELECT} WHERE c.name = ? COLLATE NOCASE`).get(name.trim()) as
    | Collection
    | undefined;
}

export function ensureCollection(name: string): Collection {
  return findCollectionByName(name) ?? createCollection({ name });
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
  sourceIds: number[],
  targetId: number,
  options: MergeOptions = {},
): { movedCount: number; deletedCollections: number; taggedCount: number } {
  const target = getCollection(targetId);
  if (!target) throw notFound('Target collection not found.');

  const validSources = sourceIds.filter((id) => id !== targetId);
  if (validSources.length === 0) return { movedCount: 0, deletedCollections: 0, taggedCount: 0 };

  return db.transaction(() => {
    let movedCount = 0;
    let taggedCount = 0;
    const selectBookmarks = db.prepare('SELECT id FROM bookmarks WHERE collection_id = ?');
    const moveStmt = db.prepare(
      "UPDATE bookmarks SET collection_id = ?, updated_at = datetime('now') WHERE collection_id = ?",
    );
    const deleteStmt = db.prepare('DELETE FROM collections WHERE id = ?');

    for (const srcId of validSources) {
      if (options.tagWithSourceNames) {
        const source = getCollection(srcId);
        const tagName = source ? normalizeTagName(source.name) : '';
        if (tagName) {
          const tagId = ensureTagIds([tagName])[0];
          if (tagId) {
            // Tagging happens before the move, while the bookmarks can still
            // be found by the collection they are leaving.
            for (const row of selectBookmarks.all(srcId) as Array<{ id: number }>) {
              linkTagStmt.run(row.id, tagId);
              taggedCount += 1;
            }
          }
        }
      }

      const updateResult = moveStmt.run(targetId, srcId);
      movedCount += updateResult.changes;
      deleteStmt.run(srcId);
    }

    return { movedCount, deletedCollections: validSources.length, taggedCount };
  })();
}

export function convertCollectionsToTags(
  collectionIds: number[],
): { converted: number; bookmarksTagged: number } {
  if (collectionIds.length === 0) return { converted: 0, bookmarksTagged: 0 };

  return db.transaction(() => {
    let converted = 0;
    let bookmarksTagged = 0;
    const selectBookmarks = db.prepare('SELECT id FROM bookmarks WHERE collection_id = ?');
    const deleteStmt = db.prepare('DELETE FROM collections WHERE id = ?');

    for (const id of collectionIds) {
      const col = getCollection(id);
      if (!col) continue;

      const tagName = normalizeTagName(col.name);
      if (tagName) {
        const tagIds = ensureTagIds([tagName]);
        const tagId = tagIds[0];
        if (tagId) {
          const rows = selectBookmarks.all(id) as Array<{ id: number }>;
          for (const row of rows) {
            linkTagStmt.run(row.id, tagId);
            bookmarksTagged += 1;
          }
        }
      }

      deleteStmt.run(id);
      converted += 1;
    }

    return { converted, bookmarksTagged };
  })();
}

export function batchAssignBookmarksToCollection(
  bookmarkIds: number[],
  collectionId: number | null,
): number {
  if (bookmarkIds.length === 0) return 0;
  if (collectionId !== null && !getCollection(collectionId)) {
    throw notFound('Target collection not found.');
  }

  return db.transaction(() => {
    const stmt = db.prepare(
      "UPDATE bookmarks SET collection_id = ?, updated_at = datetime('now') WHERE id = ?",
    );
    let count = 0;
    for (const id of bookmarkIds) {
      const res = stmt.run(collectionId, id);
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

export function getUncollectedDomainStats(limit = 25): UncollectedDomainGroup[] {
  const rows = db
    .prepare(
      `SELECT site_name AS domain, COUNT(*) AS count, GROUP_CONCAT(id) AS ids
         FROM bookmarks
        WHERE collection_id IS NULL AND site_name != ''
        GROUP BY site_name
        ORDER BY count DESC
        LIMIT ?`,
    )
    .all(limit) as Array<{ domain: string; count: number; ids: string }>;

  return rows.map((row) => ({
    domain: row.domain,
    count: row.count,
    bookmarkIds: row.ids ? row.ids.split(',').map((s) => parseInt(s, 10)).filter(Number.isFinite) : [],
  }));
}

