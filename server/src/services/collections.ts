import { db } from '../db/index.js';
import type { Collection } from '../lib/types.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';

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
