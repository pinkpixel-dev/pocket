import { config } from '../config.js';
import { db } from '../db/index.js';
import { FetchError, postJson } from '../lib/http.js';
import { findModel } from '../lib/ai-models.js';
import type { BookmarkRow } from '../lib/types.js';
import { ensureCollection, listCollections } from './collections.js';
import { ensureTagIds, normalizeTagName } from './tags.js';
import { readAiConfig } from './settings.js';

export class AiBatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiBatchError';
  }
}

export interface BatchCategorizeOptions {
  limit?: number;
  bookmarkIds?: number[];
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

const BATCH_SYSTEM_PROMPT = [
  'You organize bookmarks into clean, meaningful collections for a personal library.',
  'Analyze the list of uncollected bookmarks and suggest the most fitting collection for each.',
  'Prefer existing collections if a good match exists. Propose a new, concise collection name (1-3 words) if none fits.',
  'Avoid vague names like "Other", "Misc", or "Bookmarks".',
  'Provide 1-3 useful topic tags for each bookmark.',
  'Set confidence to "high", "medium", or "low".',
].join(' ');

const BATCH_RESPONSE_SCHEMA = {
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
            description: 'The chosen existing or new collection name, or empty string if unclassifiable.',
          },
          isNew: {
            type: 'boolean',
            description: 'True if proposing a new collection not present in the existing collections list.',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: '1 to 3 relevant topic tags.',
          },
          confidence: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
          },
        },
        required: ['bookmarkId', 'collection', 'isNew', 'tags', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['suggestions'],
  additionalProperties: false,
} as const;

function readOutputText(payload: unknown): string {
  const response = payload as {
    output_text?: string;
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  };

  if (typeof response.output_text === 'string' && response.output_text) return response.output_text;

  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue;
    for (const part of item.content ?? []) {
      if (part.type === 'output_text' && part.text) return part.text;
    }
  }
  return '';
}

export async function suggestBatchCollections(
  options: BatchCategorizeOptions = {},
): Promise<AiBatchResult> {
  const ai = readAiConfig();
  if (!ai.apiKey) throw new AiBatchError('No OpenAI API key is configured.');

  const model = findModel(ai.model);
  if (!model) throw new AiBatchError(`Pocket does not know the model "${ai.model}".`);

  const totalUncollectedRow = db
    .prepare('SELECT COUNT(*) AS count FROM bookmarks WHERE collection_id IS NULL')
    .get() as { count: number };
  const totalUncollected = totalUncollectedRow.count;

  if (totalUncollected === 0) {
    return { suggestions: [], totalUncollected: 0, processedCount: 0 };
  }

  const limit = Math.min(Math.max(Number(options.limit) || 30, 1), 50);
  let candidates: BookmarkRow[] = [];

  if (Array.isArray(options.bookmarkIds) && options.bookmarkIds.length > 0) {
    const placeholders = options.bookmarkIds.map(() => '?').join(',');
    candidates = db
      .prepare(
        `SELECT * FROM bookmarks WHERE id IN (${placeholders}) AND collection_id IS NULL LIMIT ?`,
      )
      .all(...options.bookmarkIds, limit) as BookmarkRow[];
  } else {
    candidates = db
      .prepare('SELECT * FROM bookmarks WHERE collection_id IS NULL ORDER BY id DESC LIMIT ?')
      .all(limit) as BookmarkRow[];
  }

  if (candidates.length === 0) {
    return { suggestions: [], totalUncollected, processedCount: 0 };
  }

  const existingCollections = listCollections();
  const collectionList = existingCollections.length > 0
    ? existingCollections.map((c) => `- ${c.name} (${c.bookmarkCount} bookmarks)`).join('\n')
    : '(No collections created yet)';

  const bookmarkList = candidates
    .map((b) => {
      const desc = b.description ? `   Excerpt: ${b.description.slice(0, 140)}` : '';
      return [
        `ID: ${b.id}`,
        `   URL: ${b.url}`,
        `   Domain: ${b.site_name || 'unknown'}`,
        `   Title: ${b.title || '(untitled)'}`,
        desc,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  const inputPrompt = [
    'Existing collections in this library:',
    collectionList,
    '',
    `Please categorize these ${candidates.length} uncollected bookmarks:`,
    bookmarkList,
  ].join('\n');

  let result;
  try {
    result = await postJson(
      `${config.openai.baseUrl}/responses`,
      {
        model: ai.model,
        instructions: BATCH_SYSTEM_PROMPT,
        input: inputPrompt,
        reasoning: { effort: ai.reasoningEffort },
        store: false,
        text: {
          format: {
            type: 'json_schema',
            name: 'batch_categorization',
            strict: true,
            schema: BATCH_RESPONSE_SCHEMA,
          },
        },
      },
      { authorization: `Bearer ${ai.apiKey}` },
    );
  } catch (error) {
    throw new AiBatchError(error instanceof FetchError ? error.message : 'The OpenAI request failed.');
  }

  if (result.status >= 400) {
    const detail = (result.body as { error?: { message?: string } } | null)?.error?.message;
    throw new AiBatchError(detail || `OpenAI answered with HTTP ${result.status}.`);
  }

  const text = readOutputText(result.body);
  if (!text) throw new AiBatchError('OpenAI returned an empty answer.');

  let parsed: { suggestions?: Array<{
    bookmarkId: number;
    collection: string;
    isNew: boolean;
    tags: string[];
    confidence: 'high' | 'medium' | 'low';
  }> };

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiBatchError('OpenAI response could not be parsed as JSON.');
  }

  const rawSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  const candidateMap = new Map(candidates.map((c) => [c.id, c]));

  const suggestions: CategorySuggestion[] = [];

  for (const item of rawSuggestions) {
    const candidate = candidateMap.get(item.bookmarkId);
    if (!candidate) continue;

    suggestions.push({
      bookmarkId: item.bookmarkId,
      url: candidate.url,
      domain: candidate.site_name || '',
      currentTitle: candidate.title || candidate.url,
      collection: item.collection ? item.collection.trim().slice(0, 80) : '',
      isNew: item.isNew ?? false,
      tags: Array.isArray(item.tags)
        ? item.tags.map(normalizeTagName).filter(Boolean).slice(0, 4)
        : [],
      confidence: item.confidence || 'medium',
    });
  }

  return {
    suggestions,
    totalUncollected,
    processedCount: candidates.length,
  };
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
        const col = ensureCollection(item.collectionName.trim());
        collectionId = col.id;
      }

      if (collectionId !== null) {
        updateColStmt.run(collectionId, item.bookmarkId);
        applied += 1;
      }

      if (Array.isArray(item.tags) && item.tags.length > 0) {
        const cleanedTags = item.tags.map(normalizeTagName).filter(Boolean);
        if (cleanedTags.length > 0) {
          const tagIds = ensureTagIds(cleanedTags);
          for (const tid of tagIds) {
            linkStmt.run(item.bookmarkId, tid);
          }
        }
      }
    }

    return { applied };
  })();
}
