import { db } from '../db/index.js';
import type { BookmarkRow } from '../lib/types.js';
import { AiRequestError, callAiJson } from './ai-client.js';
import { ensureCollection, listCollections } from './collections.js';
import { ensureTagIds, normalizeTagName } from './tags.js';

export { AiRequestError as AiBatchError };

export interface PlannedCollection {
  name: string;
  description: string;
  /** True when the library has no collection by this name yet. */
  isNew: boolean;
}

export interface CollectionPlan {
  collections: PlannedCollection[];
  /** The uncollected bookmarks the plan was built for, in the order they will be filed. */
  bookmarkIds: number[];
  totalUncollected: number;
}

export interface CategorySuggestion {
  bookmarkId: number;
  url: string;
  domain: string;
  currentTitle: string;
  collection: string;
  isNew: boolean;
  tags: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface AiBatchResult {
  suggestions: CategorySuggestion[];
  totalUncollected: number;
  processedCount: number;
}

export interface ApplyCategoryAssignment {
  bookmarkId: number;
  collectionName?: string;
  tags?: string[];
}

/** How many bookmarks one planning prompt looks at, and one filing call handles. */
const PLAN_SAMPLE = 250;
const ASSIGN_LIMIT = 50;

const PLAN_SYSTEM_PROMPT = [
  "You design the shelf layout for one person's private bookmark library.",
  'You get the bookmarks that are not filed yet, plus the collections the library already has.',
  'Your job is the shortest list of collections that can hold all of them.',
  'A collection is a broad subject that still makes sense after hundreds more links land in it.',
  'Names are short enough to read in a narrow sidebar: one or two words, never a phrase.',
  'Detail belongs in tags, never in a collection name.',
  'Answer with collection names only. Do not file anything yet.',
].join(' ');

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    collections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'One or two words, 18 characters at most. No "and", no ampersand, no slash.',
          },
          description: {
            type: 'string',
            description: 'One short line saying what belongs in it, for the filing step.',
          },
        },
        required: ['name', 'description'],
        additionalProperties: false,
      },
    },
  },
  required: ['collections'],
  additionalProperties: false,
} as const;

const ASSIGN_SYSTEM_PROMPT = [
  "You file bookmarks into a fixed set of collections for one person's private library.",
  'The collection list is closed. Use a name from it exactly as written, or an empty string when nothing fits.',
  'You may not invent, split, extend or narrow a collection name.',
  'What makes a link specific goes into its tags instead: a link about AI music is filed under AI and tagged music.',
  'Tags are lowercase, one or two words, and reusable across many bookmarks.',
].join(' ');

const ASSIGN_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          bookmarkId: { type: 'integer' },
          collection: {
            type: 'string',
            description: 'A name copied from the allowed list, or an empty string.',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: '1 to 3 lowercase topic tags.',
          },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['bookmarkId', 'collection', 'tags', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['suggestions'],
  additionalProperties: false,
} as const;

function countUncollected(): number {
  return (
    db.prepare('SELECT COUNT(*) AS count FROM bookmarks WHERE collection_id IS NULL').get() as {
      count: number;
    }
  ).count;
}

function selectUncollected(bookmarkIds: number[] | undefined, limit: number): BookmarkRow[] {
  if (Array.isArray(bookmarkIds) && bookmarkIds.length > 0) {
    const placeholders = bookmarkIds.map(() => '?').join(',');
    return db
      .prepare(
        `SELECT * FROM bookmarks WHERE id IN (${placeholders}) AND collection_id IS NULL
          ORDER BY id DESC LIMIT ?`,
      )
      .all(...bookmarkIds, limit) as BookmarkRow[];
  }

  return db
    .prepare('SELECT * FROM bookmarks WHERE collection_id IS NULL ORDER BY id DESC LIMIT ?')
    .all(limit) as BookmarkRow[];
}

function describeBookmark(row: BookmarkRow, withId: boolean): string {
  const parts = [
    withId ? `ID: ${row.id}` : `- ${row.title || row.url}`,
    withId ? `   Title: ${row.title || '(untitled)'}` : null,
    withId ? `   URL: ${row.url}` : `  ${row.site_name || row.url}`,
  ].filter(Boolean) as string[];

  if (!withId) return parts.join('\n');

  parts.push(`   Site: ${row.site_name || 'unknown'}`);
  if (row.description) parts.push(`   Excerpt: ${row.description.slice(0, 140)}`);
  return parts.join('\n');
}

function describeExisting(): string {
  const collections = listCollections();
  if (collections.length === 0) return '(none yet)';
  return collections
    .map((item) => `- ${item.name} (${item.bookmarkCount} bookmarks)`)
    .join('\n');
}

/**
 * Deciding the whole shelf layout before filing anything is what keeps the
 * library from growing a collection per bookmark. Filing one link at a time
 * cannot see that "AI music" and "AI prompting" are the same shelf.
 */
export async function planCollections(options: { bookmarkIds?: number[] } = {}): Promise<CollectionPlan> {
  const totalUncollected = countUncollected();
  const candidates = selectUncollected(options.bookmarkIds, PLAN_SAMPLE);

  if (candidates.length === 0) {
    return { collections: [], bookmarkIds: [], totalUncollected };
  }

  // Roughly a dozen links per collection, which keeps a library of a few
  // hundred bookmarks down to a list you can still read at a glance.
  const target = Math.max(3, Math.min(15, Math.round(candidates.length / 12)));

  const input = [
    'Collections this library already has:',
    describeExisting(),
    '',
    `Bookmarks waiting to be filed (${candidates.length}):`,
    candidates.map((row) => describeBookmark(row, false)).join('\n'),
    '',
    'Rules for the list you return:',
    `- Aim for about ${target} collections. Never return more than ${target + 3}.`,
    '- Reuse an existing collection name whenever it covers the subject. Copy it exactly.',
    '- Every collection must fit at least five of the bookmarks above.',
    '- Never include two collections where one is a narrower version of the other. "AI", not "AI music" and "AI prompting".',
    '- Never include a collection named after a single bookmark, a brand, or one product.',
    '- Keep every name to one or two words and 18 characters at most. It has to fit a narrow sidebar.',
    '- No name may join two ideas with "and", "&", "/" or a comma. "UI", not "UI component libraries & templates". The rest becomes tags.',
    '- No vague names: nothing called Other, Misc, Various, Assorted or Bookmarks.',
    '- Leave links that fit nothing out. They stay unfiled, which is fine.',
  ].join('\n');

  const parsed = await callAiJson<{ collections?: Array<{ name?: string; description?: string }> }>({
    instructions: PLAN_SYSTEM_PROMPT,
    input,
    schemaName: 'collection_plan',
    schema: PLAN_SCHEMA,
  });

  const existingNames = new Map(
    listCollections().map((item) => [item.name.toLowerCase(), item.name]),
  );
  const seen = new Set<string>();
  const collections: PlannedCollection[] = [];

  for (const item of parsed.collections ?? []) {
    const name = (item.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    // An existing collection keeps its own spelling, so filing does not create
    // a second collection that differs only in case.
    collections.push({
      name: existingNames.get(key) ?? name,
      description: (item.description ?? '').trim().slice(0, 200),
      isNew: !existingNames.has(key),
    });
  }

  if (collections.length === 0) {
    throw new AiRequestError('The AI did not return any collections to file into.');
  }

  return {
    collections,
    bookmarkIds: candidates.map((row) => row.id),
    totalUncollected,
  };
}

export interface BatchCategorizeOptions {
  limit?: number;
  bookmarkIds?: number[];
  /** The closed list of collection names filing may use. */
  collections?: string[];
}

export async function suggestBatchCollections(
  options: BatchCategorizeOptions = {},
): Promise<AiBatchResult> {
  const totalUncollected = countUncollected();
  if (totalUncollected === 0) {
    return { suggestions: [], totalUncollected: 0, processedCount: 0 };
  }

  const limit = Math.min(Math.max(Number(options.limit) || 30, 1), ASSIGN_LIMIT);
  const candidates = selectUncollected(options.bookmarkIds, limit);
  if (candidates.length === 0) {
    return { suggestions: [], totalUncollected, processedCount: 0 };
  }

  const existing = listCollections();
  const existingNames = new Map(existing.map((item) => [item.name.toLowerCase(), item.name]));

  // Without a plan the library's own collections are the closed list, so a run
  // started from an older client still cannot invent a name per bookmark.
  const allowed = (options.collections ?? []).map((name) => name.trim()).filter(Boolean);
  const allowedNames = allowed.length > 0 ? allowed : existing.map((item) => item.name);

  if (allowedNames.length === 0) {
    throw new AiRequestError('Plan the collections first. There is nothing to file into yet.');
  }

  const allowedLookup = new Map(allowedNames.map((name) => [name.toLowerCase(), name]));

  const input = [
    'Collections you may use, and nothing else:',
    allowedNames.map((name) => `- ${name}`).join('\n'),
    '',
    `File these ${candidates.length} bookmarks:`,
    candidates.map((row) => describeBookmark(row, true)).join('\n\n'),
    '',
    'Rules:',
    '- Copy a collection name from the list above, character for character.',
    '- Return an empty string when none of them is a real fit. Do not force one.',
    '- Give 1 to 3 tags. Put the specific subject there, not in the collection name.',
  ].join('\n');

  const parsed = await callAiJson<{
    suggestions?: Array<{
      bookmarkId: number;
      collection: string;
      tags: string[];
      confidence: 'high' | 'medium' | 'low';
    }>;
  }>({
    instructions: ASSIGN_SYSTEM_PROMPT,
    input,
    schemaName: 'batch_categorization',
    schema: ASSIGN_SCHEMA,
  });

  const candidateMap = new Map(candidates.map((row) => [row.id, row]));
  const suggestions: CategorySuggestion[] = [];

  for (const item of parsed.suggestions ?? []) {
    const candidate = candidateMap.get(item.bookmarkId);
    if (!candidate) continue;

    // A name off the list is the model ignoring the plan, so drop the
    // collection rather than letting a one-off shelf in through the back door.
    const matched = allowedLookup.get((item.collection ?? '').trim().toLowerCase()) ?? '';

    suggestions.push({
      bookmarkId: item.bookmarkId,
      url: candidate.url,
      domain: candidate.site_name || '',
      currentTitle: candidate.title || candidate.url,
      collection: matched,
      isNew: matched !== '' && !existingNames.has(matched.toLowerCase()),
      tags: Array.isArray(item.tags)
        ? item.tags.map(normalizeTagName).filter(Boolean).slice(0, 4)
        : [],
      confidence: item.confidence || 'medium',
    });
  }

  return { suggestions, totalUncollected, processedCount: candidates.length };
}

export function applyBatchCategorization(
  assignments: ApplyCategoryAssignment[],
): { applied: number } {
  if (assignments.length === 0) return { applied: 0 };

  return db.transaction(() => {
    let applied = 0;
    const updateColStmt = db.prepare(
      "UPDATE bookmarks SET collection_id = ?, updated_at = datetime('now') WHERE id = ?",
    );
    const linkStmt = db.prepare(
      'INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?)',
    );

    for (const item of assignments) {
      if (!item.bookmarkId) continue;
      let collectionId: number | null = null;

      if (item.collectionName && item.collectionName.trim()) {
        collectionId = ensureCollection(item.collectionName.trim()).id;
      }

      if (collectionId !== null) {
        updateColStmt.run(collectionId, item.bookmarkId);
        applied += 1;
      }

      if (Array.isArray(item.tags) && item.tags.length > 0) {
        const cleanedTags = item.tags.map(normalizeTagName).filter(Boolean);
        if (cleanedTags.length > 0) {
          for (const tagId of ensureTagIds(cleanedTags)) {
            linkStmt.run(item.bookmarkId, tagId);
          }
        }
      }
    }

    return { applied };
  })();
}
