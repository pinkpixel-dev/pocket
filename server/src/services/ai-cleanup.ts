import { db } from '../db/index.js';
import { callAiJson } from './ai-client.js';
import { listCollections } from './collections.js';
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
export async function suggestCollectionCleanup(): Promise<CleanupPlan> {
  const collections = listCollections();
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
  }>({
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
