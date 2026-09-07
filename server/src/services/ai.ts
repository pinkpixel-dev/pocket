import { config } from '../config.js';
import { db } from '../db/index.js';
import { FetchError, postJson } from '../lib/http.js';
import { findModel } from '../lib/ai-models.js';
import { domainOf } from '../lib/url.js';
import type { AiStatus, Bookmark, BookmarkRow } from '../lib/types.js';
import { getBookmark, getBookmarkRow } from './bookmarks.js';
import { createCollection, findCollectionByName, listCollections } from './collections.js';
import { listTags, normalizeTagName, setBookmarkTags } from './tags.js';
import { readAiConfig } from './settings.js';
import { fetchMetadata } from './metadata.js';

export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiError';
  }
}

interface Suggestion {
  title: string;
  description: string;
  tags: string[];
  collection: string | null;
}

/**
 * `strict` needs every property listed in `required` and no extras, so an
 * unknown collection is expressed as an empty string rather than an absent key.
 */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: 'A short, plain title for the page. Empty string if the page gives you nothing to work with.',
    },
    description: {
      type: 'string',
      description: 'One or two sentences saying what this page is and why someone saved it. No marketing language.',
    },
    tags: {
      type: 'array',
      description: 'Between two and five lowercase topic tags.',
      items: { type: 'string' },
    },
    collection: {
      type: 'string',
      description: 'The name of the collection this belongs in, or an empty string if none fits and you may not create one.',
    },
  },
  required: ['title', 'description', 'collection', 'tags'],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = [
  'You file bookmarks for one person\'s private library.',
  'You are given a saved page and the collections and tags that library already uses.',
  'Answer only from what the page actually says. Never invent a fact about it.',
  'Titles are plain and specific. Descriptions are one or two sentences, factual, no sales language.',
  'Tags are lowercase, one or two words each, and reusable across many bookmarks.',
  'Reuse a tag the library already has instead of inventing a synonym, a plural, or a slightly different phrasing of it. A tag used once is a tag that failed.',
  'Collections are broad subject areas, not topics. What makes a link specific belongs in its tags.',
  'Collection names are one or two words and fit a narrow sidebar. Never join two ideas with "and", "&" or "/".',
  'A library with a collection per link is not organized, it is a list with extra steps.',
].join(' ');

/**
 * A collection name alone is thin evidence. Showing what is actually filed
 * under it is what stops a model dropping a machine-learning link into
 * "Dev posts" because both sound vaguely technical.
 */
const sampleTitles = db.prepare(
  `SELECT title FROM bookmarks
    WHERE collection_id = ? AND title != ''
    ORDER BY created_at DESC
    LIMIT 3`,
);

function describeCollections(): string {
  const collections = listCollections();
  if (collections.length === 0) return '(none yet)';

  return collections
    .map((item) => {
      const samples = (sampleTitles.all(item.id) as Array<{ title: string }>)
        .map((row) => `"${row.title.slice(0, 70)}"`)
        .join(', ');

      const parts = [`- ${item.name}`];
      if (item.description) parts.push(`  what it is for: ${item.description}`);
      if (samples) parts.push(`  already filed here: ${samples}`);
      else parts.push('  already filed here: nothing yet');
      return parts.join('\n');
    })
    .join('\n');
}

function buildPrompt(row: BookmarkRow, excerpt: string, canCreateCollection: boolean): string {
  // listTags is ordered by use, so this is the part of the vocabulary that is
  // actually shared rather than 300 one-off tags in alphabetical order.
  const tags = listTags().slice(0, 80);

  const collectionRule = canCreateCollection
    ? [
        'Choosing the collection:',
        '- Pick one from the list when this link belongs to the same subject area as what is filed there. Judge by the subject, not by whether both are broadly technical.',
        '- Never propose a narrower version of a collection that already exists. A link about AI music goes in "AI" with the tag music, not in a new "AI music".',
        '- When you are torn between an existing collection and a new one, use the existing one.',
        '- Only name a new collection when nothing on the list is even close, and name it broadly enough that dozens of future links will also belong there. Never name it after this one page, a brand, or a single product.',
        '- Keep a new name to one or two words and 18 characters at most. "UI", not "UI component libraries and templates". Everything the name leaves out goes into the tags.',
        '- Return an empty string when nothing fits and no broad name is warranted. Staying unfiled with good tags is a fine outcome.',
      ].join('\n')
    : [
        'Choosing the collection:',
        '- Pick one from the list only when this link is about the same subject as the links already filed there.',
        '- Return an empty string when none of them fit. You may not invent a new name.',
      ].join('\n');

  return [
    'Saved page',
    `URL: ${row.url}`,
    `Site: ${row.site_name || domainOf(row.url)}`,
    row.title ? `Existing title: ${row.title}` : 'Existing title: (none)',
    row.description ? `Existing description: ${row.description}` : 'Existing description: (none)',
    '',
    'Page text',
    excerpt || '(the page gave up no readable text; work from the URL and title alone)',
    '',
    'Collections already in this library',
    describeCollections(),
    '',
    'Tags already in this library, most used first',
    tags.length ? tags.map((tag) => `${tag.name} (${tag.bookmarkCount})`).join(', ') : '(none yet)',
    '',
    collectionRule,
  ].join('\n');
}

function readOutputText(payload: unknown): string {
  const response = payload as {
    output_text?: string;
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  };

  if (typeof response.output_text === 'string' && response.output_text) return response.output_text;

  // Reasoning items sit in the same array, so the message item is picked out.
  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue;
    for (const part of item.content ?? []) {
      if (part.type === 'output_text' && part.text) return part.text;
    }
  }
  return '';
}

function errorMessage(status: number, payload: unknown): string {
  const detail = (payload as { error?: { message?: string } } | null)?.error?.message;
  if (detail) return detail;
  if (status === 401) return 'OpenAI rejected the API key.';
  if (status === 429) return 'OpenAI rate limited the request, or the account is out of credit.';
  return `OpenAI answered with HTTP ${status}.`;
}

async function askModel(prompt: string): Promise<Suggestion> {
  const ai = readAiConfig();
  if (!ai.apiKey) throw new AiError('No OpenAI key is set.');

  const model = findModel(ai.model);
  if (!model) throw new AiError(`Pocket does not know the model "${ai.model}".`);

  let result;
  try {
    result = await postJson(
      `${config.openai.baseUrl}/responses`,
      {
        model: ai.model,
        instructions: SYSTEM_PROMPT,
        input: prompt,
        reasoning: { effort: ai.reasoningEffort },
        // Nothing here needs to be kept on OpenAI's side between calls.
        store: false,
        text: {
          format: {
            type: 'json_schema',
            name: 'bookmark_details',
            strict: true,
            schema: RESPONSE_SCHEMA,
          },
        },
      },
      { authorization: `Bearer ${ai.apiKey}` },
    );
  } catch (error) {
    throw new AiError(error instanceof FetchError ? error.message : 'The OpenAI request failed.');
  }

  if (result.status >= 400) throw new AiError(errorMessage(result.status, result.body));

  const text = readOutputText(result.body);
  if (!text) throw new AiError('OpenAI returned an empty answer.');

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new AiError('OpenAI returned something that was not the expected JSON.');
  }

  const rawTags = Array.isArray(parsed.tags) ? parsed.tags : [];
  return {
    title: typeof parsed.title === 'string' ? parsed.title.trim().slice(0, 300) : '',
    description: typeof parsed.description === 'string' ? parsed.description.trim().slice(0, 600) : '',
    tags: [
      ...new Set(rawTags.map((tag) => normalizeTagName(String(tag))).filter(Boolean)),
    ].slice(0, 6),
    collection: typeof parsed.collection === 'string' && parsed.collection.trim()
      ? parsed.collection.trim().replace(/\s+/g, ' ').slice(0, 80)
      : null,
  };
}

const setStatus = db.prepare(
  `UPDATE bookmarks
      SET ai_status = @status,
          ai_error = @error,
          ai_applied_at = CASE WHEN @status = 'pending' THEN ai_applied_at ELSE datetime('now') END
    WHERE id = @id`,
);

export function markAiPending(id: number): void {
  setStatus.run({ id, status: 'pending' as AiStatus, error: null });
}

/**
 * Only ever writes into a gap. A title, description, collection or tag the
 * user already has survives untouched, which is what makes running this
 * automatically after the metadata fetch safe.
 */
function apply(row: BookmarkRow, suggestion: Suggestion, canCreateCollection: boolean): boolean {
  const fields: string[] = [];
  const params: Record<string, unknown> = { id: row.id };

  if (!row.title && suggestion.title) {
    fields.push('title = @title');
    params.title = suggestion.title;
  }
  if (!row.description && suggestion.description) {
    fields.push('description = @description');
    params.description = suggestion.description;
  }

  if (row.collection_id === null && suggestion.collection) {
    const existing = findCollectionByName(suggestion.collection);
    const collection = existing ?? (canCreateCollection ? createCollection({ name: suggestion.collection }) : null);
    if (collection) {
      fields.push('collection_id = @collectionId');
      params.collectionId = collection.id;
    }
  }

  const hasTags =
    (db.prepare('SELECT COUNT(*) AS count FROM bookmark_tags WHERE bookmark_id = ?').get(row.id) as {
      count: number;
    }).count > 0;
  const addTags = !hasTags && suggestion.tags.length > 0;

  if (fields.length === 0 && !addTags) return false;

  db.transaction(() => {
    if (fields.length) {
      db.prepare(
        `UPDATE bookmarks SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = @id`,
      ).run(params);
    }
    if (addTags) setBookmarkTags(row.id, suggestion.tags);
  })();

  return true;
}

export interface AiFillOptions {
  /** Passed straight through from the metadata fetch, to avoid a second one. */
  excerpt?: string;
}

/**
 * Fills whatever the metadata fetch could not. Returns the bookmark, or null
 * if it was deleted while the request was in flight.
 */
export async function fillWithAi(id: number, options: AiFillOptions = {}): Promise<Bookmark | null> {
  const row = getBookmarkRow(id);
  if (!row) return null;

  const ai = readAiConfig();
  if (!ai.apiKey) {
    setStatus.run({ id, status: 'skipped' as AiStatus, error: null });
    return getBookmark(id);
  }

  const hasTags =
    (db.prepare('SELECT COUNT(*) AS count FROM bookmark_tags WHERE bookmark_id = ?').get(id) as {
      count: number;
    }).count > 0;

  if (row.title && row.description && row.collection_id !== null && hasTags) {
    setStatus.run({ id, status: 'skipped' as AiStatus, error: null });
    return getBookmark(id);
  }

  let excerpt = options.excerpt ?? '';
  if (!excerpt) {
    // A manual run, or one resumed after a restart, has no excerpt in hand.
    try {
      excerpt = (await fetchMetadata(row.url)).excerpt;
    } catch {
      // The page being unreachable is not fatal; the model still has the URL.
    }
  }

  try {
    const suggestion = await askModel(buildPrompt(row, excerpt, ai.createCollections));
    const fresh = getBookmarkRow(id);
    if (!fresh) return null;

    const changed = apply(fresh, suggestion, ai.createCollections);
    setStatus.run({ id, status: (changed ? 'ok' : 'skipped') satisfies AiStatus, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The AI step failed.';
    setStatus.run({ id, status: 'failed' as AiStatus, error: message.slice(0, 400) });
  }

  return getBookmark(id);
}
