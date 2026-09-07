import { Router } from 'express';
import { z } from 'zod';
import {
  batchAssignBookmarksToCollection,
  convertCollectionsToTags,
  createCollection,
  deleteCollection,
  getUncollectedDomainStats,
  listCollections,
  mergeCollections,
  updateCollection,
} from '../services/collections.js';
import { deleteTag, listTags, renameTag } from '../services/tags.js';
import { countBookmarks } from '../services/bookmarks.js';
import { db } from '../db/index.js';
import { queueSize } from '../services/queue.js';
import { badRequest } from '../lib/errors.js';
import { cancelLibraryAudit, getAuditStatus, startLibraryAudit } from '../services/audit.js';
import { isAiConfigured } from '../services/settings.js';
import { applyBatchCategorization, suggestBatchCollections } from '../services/ai-batch.js';

export const libraryRouter = Router();

const idParam = z.coerce.number().int().positive();

const collectionSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'A collection colour must look like #7c5cff.')
    .nullable()
    .optional(),
});

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw badRequest(result.error.issues[0]?.message ?? 'That request could not be understood.');
  }
  return result.data;
}

libraryRouter.get('/collections', (_req, res) => {
  res.json({ collections: listCollections() });
});

libraryRouter.post('/collections', (req, res) => {
  res.status(201).json({ collection: createCollection(parse(collectionSchema, req.body)) });
});

libraryRouter.patch('/collections/:id', (req, res) => {
  const id = idParam.parse(req.params.id);
  res.json({ collection: updateCollection(id, parse(collectionSchema.partial(), req.body)) });
});

libraryRouter.delete('/collections/:id', (req, res) => {
  deleteCollection(idParam.parse(req.params.id));
  res.status(204).end();
});

libraryRouter.post('/collections/merge', (req, res) => {
  const schema = z.object({
    sourceIds: z.array(z.number().int().positive()).min(1),
    targetId: z.number().int().positive(),
  });
  const data = parse(schema, req.body);
  res.json(mergeCollections(data.sourceIds, data.targetId));
});

libraryRouter.post('/collections/convert-to-tags', (req, res) => {
  const schema = z.object({
    collectionIds: z.array(z.number().int().positive()).min(1),
  });
  const data = parse(schema, req.body);
  res.json(convertCollectionsToTags(data.collectionIds));
});

libraryRouter.get('/library/uncollected-domains', (req, res) => {
  const limitParsed = req.query.limit ? parseInt(String(req.query.limit), 10) : 25;
  const limit = Math.min(Math.max(Number.isFinite(limitParsed) ? limitParsed : 25, 1), 100);
  res.json({ domains: getUncollectedDomainStats(limit) });
});

libraryRouter.post('/library/batch-assign-collection', (req, res) => {
  const schema = z.object({
    bookmarkIds: z.array(z.number().int().positive()).min(1),
    collectionId: z.number().int().positive().nullable(),
  });
  const data = parse(schema, req.body);
  const updatedCount = batchAssignBookmarksToCollection(data.bookmarkIds, data.collectionId);
  res.json({ updatedCount });
});

libraryRouter.post('/ai/suggest-categories', async (req, res, next) => {
  try {
    if (!isAiConfigured()) {
      throw badRequest('Add an OpenAI API key in Settings first.');
    }
    const schema = z.object({
      limit: z.number().int().min(1).max(50).optional(),
      bookmarkIds: z.array(z.number().int().positive()).optional(),
    });
    const data = parse(schema, req.body);
    const result = await suggestBatchCollections(data);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

libraryRouter.post('/ai/apply-categories', (req, res) => {
  const schema = z.object({
    assignments: z.array(
      z.object({
        bookmarkId: z.number().int().positive(),
        collectionName: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
    ).min(1),
  });
  const data = parse(schema, req.body);
  res.json(applyBatchCategorization(data.assignments));
});

libraryRouter.get('/tags', (_req, res) => {
  res.json({ tags: listTags() });
});

libraryRouter.patch('/tags/:id', (req, res) => {
  const id = idParam.parse(req.params.id);
  const { name } = parse(z.object({ name: z.string().min(1).max(60) }), req.body);
  res.json({ tag: renameTag(id, name) });
});

libraryRouter.delete('/tags/:id', (req, res) => {
  deleteTag(idParam.parse(req.params.id));
  res.status(204).end();
});

libraryRouter.get('/stats', (_req, res) => {
  const pinned = (db.prepare('SELECT COUNT(*) AS count FROM bookmarks WHERE is_pinned = 1').get() as {
    count: number;
  }).count;
  const untagged = (
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM bookmarks b
          WHERE NOT EXISTS (SELECT 1 FROM bookmark_tags bt WHERE bt.bookmark_id = b.id)`,
      )
      .get() as { count: number }
  ).count;
  const uncollected = (
    db.prepare('SELECT COUNT(*) AS count FROM bookmarks WHERE collection_id IS NULL').get() as {
      count: number;
    }
  ).count;
  const needsAttention = (
    db.prepare("SELECT COUNT(*) AS count FROM bookmarks WHERE metadata_status = 'failed'").get() as {
      count: number;
    }
  ).count;

  res.json({
    total: countBookmarks(),
    pinned,
    untagged,
    uncollected,
    needsAttention,
    collections: listCollections().length,
    tags: listTags().length,
    pendingJobs: queueSize(),
  });
});

libraryRouter.get('/audit-links', (_req, res) => {
  res.json(getAuditStatus());
});

libraryRouter.post('/audit-links', (_req, res) => {
  res.json(startLibraryAudit());
});

libraryRouter.post('/audit-links/cancel', (_req, res) => {
  res.json({ cancelled: cancelLibraryAudit() });
});

