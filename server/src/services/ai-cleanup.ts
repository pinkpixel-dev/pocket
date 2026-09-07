import { db } from '../db/index.js';
import { callAiJson } from './ai-client.js';
import { listCollections } from './collections.js';
import { listTags } from './tags.js';
import type { Collection } from '../lib/types.js';

export interface CleanupSource {
  id: number;
  name: string;
  bookmarkCount: number;
}

export interface CleanupAction {
  kind: 'merge' | 'convert_to_tags';
  /** The collection everything moves into. Empty for a tag conversion. */
  target: string;
  /** Null when the merge target has to be created first. */
  targetId: number | null;
  sources: CleanupSource[];
  reason: string;
}

export interface CleanupPlan {
  actions: CleanupAction[];
  collectionCount: number;
  /** Collections holding one bookmark, which is what usually triggers a tidy-up. */
  singletonCount: number;
}

const CLEANUP_SYSTEM_PROMPT = [
  "You tidy the collection list of one person's private bookmark library.",
  'The list has drifted: filing links one at a time made a collection per subject instead of a collection per subject area.',
  'You propose merges and tag conversions. You never propose deleting a bookmark.',
  'Merging keeps the old collection name as a tag, so nothing about a link is lost when its shelf disappears.',
].join(' ');

const CLEANUP_SCHEMA = {
  type: 'object',
  properties: {
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['merge', 'convert_to_tags'],
            description: 'merge folds collections into one. convert_to_tags removes them and keeps the name as a tag.',
          },
          target: {
            type: 'string',
            description: 'For a merge, the collection everything moves into. Empty string for convert_to_tags.',
          },
          sources: {
            type: 'array',
            items: { type: 'string' },
            description: 'Existing collection names this action consumes, copied exactly.',
          },
          reason: { type: 'string', description: 'One short line the owner will read.' },
        },
        required: ['kind', 'target', 'sources', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['actions'],
  additionalProperties: false,
} as const;

const sampleTitles = db.prepare(
  `SELECT title FROM bookmarks
    WHERE collection_id = ? AND title != ''
    ORDER BY created_at DESC
    LIMIT 3`,
);

function describe(collection: Collection): string {
  const samples = (sampleTitles.all(collection.id) as Array<{ title: string }>)
    .map((row) => `"${row.title.slice(0, 60)}"`)
    .join(', ');

  const lines = [`- ${collection.name} (${collection.bookmarkCount} bookmarks)`];
  if (collection.description) lines.push(`  described as: ${collection.description}`);
  lines.push(`  holds: ${samples || 'nothing yet'}`);
  return lines.join('\n');
}

/**
 * Looks at the whole collection list at once, which is the only vantage point
 * from which "Creative licensing" and "Open source licensing" obviously want
 * to be one shelf called Licensing.
 */
export async function suggestCollectionCleanup(userId: number): Promise<CleanupPlan> {
  const collections = listCollections(userId);
  const singletonCount = collections.filter((item) => item.bookmarkCount <= 1).length;

  if (collections.length < 2) {
    return { actions: [], collectionCount: collections.length, singletonCount };
  }

  const target = Math.max(3, Math.min(15, Math.round(collections.length / 3)));

  const input = [
    `This library has ${collections.length} collections:`,
    collections.map(describe).join('\n'),
    '',
    'Rules:',
    `- Aim to land near ${target} collections once your actions are applied.`,
    '- Merge collections that are the same subject area at different zoom levels. "AI music" and "AI prompting" both belong in "AI".',
    '- A merge target should be the broadest of the names involved. Use an existing name when one fits, otherwise name the shelf they share.',
    '- A merge is also the moment to shorten a name. One or two words, 18 characters at most, and never two ideas joined by "and", "&" or "/". "UI Component libraries & templates" becomes "UI".',
    '- Convert a collection to tags when it holds one or two links and belongs to no larger subject.',
    '- Leave a collection alone when it is already broad and well filled. Say nothing about it.',
    '- Never merge unrelated subjects just to reach the number. A wrong shelf is worse than an extra one.',
    '- Every name in sources must be copied exactly from the list above. Use each collection at most once.',
  ].join('\n');

  const parsed = await callAiJson<{
    actions?: Array<{ kind?: string; target?: string; sources?: string[]; reason?: string }>;
  }>(userId, {
    instructions: CLEANUP_SYSTEM_PROMPT,
    input,
    schemaName: 'collection_cleanup',
    schema: CLEANUP_SCHEMA,
  });

  const byName = new Map(collections.map((item) => [item.name.toLowerCase(), item]));
  const claimed = new Set<number>();
  const actions: CleanupAction[] = [];

  for (const item of parsed.actions ?? []) {
    const kind = item.kind === 'convert_to_tags' ? 'convert_to_tags' : 'merge';
    const targetName = (item.target ?? '').trim();
    const targetCollection = byName.get(targetName.toLowerCase());

    const sources: CleanupSource[] = [];
    for (const raw of item.sources ?? []) {
      const source = byName.get((raw ?? '').trim().toLowerCase());
      // A name the model invented, or one another action already took, would
      // make the plan lie about what it is going to do.
      if (!source || claimed.has(source.id)) continue;
      if (kind === 'merge' && targetCollection && source.id === targetCollection.id) continue;
      sources.push({ id: source.id, name: source.name, bookmarkCount: source.bookmarkCount });
    }

    if (sources.length === 0) continue;
    if (kind === 'merge' && !targetName) continue;

    for (const source of sources) claimed.add(source.id);

    actions.push({
      kind,
      target: kind === 'merge' ? (targetCollection?.name ?? targetName.slice(0, 80)) : '',
      targetId: kind === 'merge' ? (targetCollection?.id ?? null) : null,
      sources,
      reason: (item.reason ?? '').trim().slice(0, 200),
    });
  }

  return { actions, collectionCount: collections.length, singletonCount };
}

export interface TagCleanupSource {
  id: number;
  name: string;
  bookmarkCount: number;
}

export interface TagCleanupAction {
  kind: 'merge' | 'delete';
  /** The tag everything folds into. Empty for a delete. */
  target: string;
  sources: TagCleanupSource[];
  reason: string;
}

export interface TagCleanupPlan {
  actions: TagCleanupAction[];
  tagCount: number;
  /** Tags on a single bookmark, which is what a bloated tag list is made of. */
  singletonCount: number;
}

/** How many tags one review covers. Beyond this the prompt stops being readable. */
const TAG_REVIEW_LIMIT = 300;

const TAG_SYSTEM_PROMPT = [
  "You tidy the tag vocabulary of one person's private bookmark library.",
  'Filing links one at a time grew a tag per link: synonyms, plurals, and phrasings of the same idea sitting side by side.',
  'You fold those together and point out the ones carrying no meaning at all.',
  'A good tag is one many bookmarks can share. A tag used once described a bookmark instead of grouping it.',
].join(' ');

const TAG_CLEANUP_SCHEMA = {
  type: 'object',
  properties: {
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['merge', 'delete'],
            description: 'merge folds tags into one name. delete removes tags that group nothing.',
          },
          target: {
            type: 'string',
            description: 'For a merge, the tag everything folds into. Empty string for delete.',
          },
          sources: {
            type: 'array',
            items: { type: 'string' },
            description: 'Existing tag names this action consumes, copied exactly.',
          },
          reason: { type: 'string', description: 'One short line the owner will read.' },
        },
        required: ['kind', 'target', 'sources', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['actions'],
  additionalProperties: false,
} as const;

/**
 * The tag equivalent of the collection tidy-up. Tags fragment differently:
 * collections drift into sub-topics, tags drift into synonyms and plurals, so
 * this one is mostly looking for words that mean the same thing.
 */
export async function suggestTagCleanup(userId: number): Promise<TagCleanupPlan> {
  const tags = listTags(userId);
  const singletonCount = tags.filter((tag) => tag.bookmarkCount <= 1).length;

  if (tags.length < 2) {
    return { actions: [], tagCount: tags.length, singletonCount };
  }

  const reviewed = tags.slice(0, TAG_REVIEW_LIMIT);
  const singles = reviewed.filter((tag) => tag.bookmarkCount <= 1);
  const target = Math.max(10, Math.round(reviewed.length / 4));

  const input = [
    `This library uses ${tags.length} tags. Here they are, most used first, with how many bookmarks carry each:`,
    reviewed.map((tag) => `- ${tag.name} (${tag.bookmarkCount})`).join('\n'),
    '',
    'Rules:',
    `- Aim to land near ${target} tags once your actions are applied. That means folding most of the ${singles.length} tags used only once into tags that are already shared.`,
    '- Merge synonyms, plurals, hyphenations and rephrasings into the one that is already used most. "llm", "llms" and "large language models" are one tag.',
    '- Merge a tag that is a wordier version of another into the shorter one. "shell commands" and "command-line" belong with "shell".',
    '- Also merge a narrow tag into the broader tag it is an example of, when the broader one is already in use. "arch linux" belongs with "linux", "gmail" with "email".',
    '- Deleting is the last resort. Prefer merging a one-off tag into something broader. Propose a delete only when no tag in the list is even related to it.',
    '- Leave a tag alone when it is already shared and distinct. Say nothing about it.',
    '- Never merge tags that mean different things just to reach the number.',
    '- Every name in sources must be copied exactly from the list above. Use each tag at most once.',
    '- A merge target should be a tag from the list. Only name a new one when the shared word is missing entirely.',
    `- Be thorough. A plan of five actions for ${reviewed.length} tags is not worth reviewing. Group every source you can into each action instead of returning one action per pair.`,
  ].join('\n');

  const parsed = await callAiJson<{
    actions?: Array<{ kind?: string; target?: string; sources?: string[]; reason?: string }>;
  }>(userId, {
    instructions: TAG_SYSTEM_PROMPT,
    input,
    schemaName: 'tag_cleanup',
    schema: TAG_CLEANUP_SCHEMA,
  });

  const byName = new Map(tags.map((tag) => [tag.name.toLowerCase(), tag]));
  const claimed = new Set<number>();
  const actions: TagCleanupAction[] = [];

  for (const item of parsed.actions ?? []) {
    const kind = item.kind === 'delete' ? 'delete' : 'merge';
    const targetName = (item.target ?? '').trim();
    const targetTag = byName.get(targetName.toLowerCase());

    const sources: TagCleanupSource[] = [];
    for (const raw of item.sources ?? []) {
      const source = byName.get((raw ?? '').trim().toLowerCase());
      if (!source || claimed.has(source.id)) continue;
      if (kind === 'merge' && targetTag && source.id === targetTag.id) continue;
      sources.push({ id: source.id, name: source.name, bookmarkCount: source.bookmarkCount });
    }

    if (sources.length === 0) continue;
    if (kind === 'merge' && !targetName) continue;

    for (const source of sources) claimed.add(source.id);

    actions.push({
      kind,
      target: kind === 'merge' ? (targetTag?.name ?? targetName.slice(0, 60)) : '',
      sources,
      reason: (item.reason ?? '').trim().slice(0, 200),
    });
  }

  return { actions, tagCount: tags.length, singletonCount };
}
