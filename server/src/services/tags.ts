import { db } from '../db/index.js';
import type { Tag } from '../lib/types.js';
import { badRequest, notFound } from '../lib/errors.js';

/** Tags are lowercase, space-collapsed, and free of the characters we filter on. */
export function normalizeTagName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[,#]/g, '')
    .slice(0, 60)
    .toLowerCase();
}

export function parseTagInput(input: string | string[] | undefined): string[] {
  if (!input) return [];
  const parts = Array.isArray(input) ? input : input.split(',');
  const seen = new Set<string>();
  for (const part of parts) {
    const name = normalizeTagName(part);
    if (name) seen.add(name);
  }
  return [...seen].slice(0, 30);
}

const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
const selectTag = db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE');

export function ensureTagIds(names: string[]): number[] {
  const ids: number[] = [];
  for (const name of names) {
    insertTag.run(name);
    const row = selectTag.get(name) as { id: number } | undefined;
    if (row) ids.push(row.id);
  }
  return ids;
}

const clearBookmarkTags = db.prepare('DELETE FROM bookmark_tags WHERE bookmark_id = ?');
const linkBookmarkTag = db.prepare('INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?)');

export function setBookmarkTags(bookmarkId: number, names: string[]): void {
  const ids = ensureTagIds(names);
  clearBookmarkTags.run(bookmarkId);
  for (const id of ids) linkBookmarkTag.run(bookmarkId, id);
}

/** Drops tags that no bookmark points at, so the sidebar stays honest. */
export function pruneOrphanTags(): number {
  const result = db
    .prepare('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM bookmark_tags)')
    .run();
  return result.changes;
}

export function listTags(): Tag[] {
  return db
    .prepare(
      `SELECT t.id, t.name, COUNT(bt.bookmark_id) AS bookmarkCount
         FROM tags t
         LEFT JOIN bookmark_tags bt ON bt.tag_id = t.id
        GROUP BY t.id
        ORDER BY bookmarkCount DESC, t.name ASC`,
    )
    .all() as Tag[];
}

export function renameTag(id: number, rawName: string): Tag {
  const name = normalizeTagName(rawName);
  if (!name) throw badRequest('A tag needs a name.');

  const existing = db.prepare('SELECT id FROM tags WHERE id = ?').get(id) as { id: number } | undefined;
  if (!existing) throw notFound('That tag no longer exists.');

  const clash = db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE AND id != ?').get(name, id) as
    | { id: number }
    | undefined;

  db.transaction(() => {
    if (clash) {
      // Merge into the tag that already owns the name rather than failing.
      db.prepare('UPDATE OR IGNORE bookmark_tags SET tag_id = ? WHERE tag_id = ?').run(clash.id, id);
      db.prepare('DELETE FROM bookmark_tags WHERE tag_id = ?').run(id);
      db.prepare('DELETE FROM tags WHERE id = ?').run(id);
    } else {
      db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(name, id);
    }
  })();

  const finalId = clash ? clash.id : id;
  return listTags().find((tag) => tag.id === finalId) ?? { id: finalId, name, bookmarkCount: 0 };
}

export function deleteTag(id: number): void {
  const result = db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  if (result.changes === 0) throw notFound('That tag no longer exists.');
}
