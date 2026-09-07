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
import { deleteTag, deleteTags, listTags, mergeTags, renameTag } from '../services/tags.js';
import { countBookmarks } from '../services/bookmarks.js';
import { db } from '../db/index.js';
import { queueSize } from '../services/queue.js';
import { badRequest } from '../lib/errors.js';
import { requireAuth, userIdOf } from '../middleware/auth.js';
import { cancelLibraryAudit, getAuditStatus, startLibraryAudit } from '../services/audit.js';
import { isAiConfigured } from '../services/settings.js';
import {
  applyBatchCategorization,
  planCollections,
  suggestBatchCollections,
} from '../services/ai-batch.js';
import { suggestCollectionCleanup, suggestTagCleanup } from '../services/ai-cleanup.js';

export const libraryRouter = Router();

libraryRouter.use(requireAuth);

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

libraryRouter.get('/collections', (req, res) => {
  res.json({ collections: listCollections(userIdOf(req)) });
});

libraryRouter.post('/collections', (req, res) => {
  res.status(201).json({ collection: createCollection(userIdOf(req), parse(collectionSchema, req.body)) });
});

libraryRouter.patch('/collections/:id', (req, res) => {
  const id = idParam.parse(req.params.id);
  res.json({
    collection: updateCollection(userIdOf(req), id, parse(collectionSchema.partial(), req.body)),
  });
});

libraryRouter.delete('/collections/:id', (req, res) => {
  deleteCollection(userIdOf(req), idParam.parse(req.params.id));
  res.status(204).end();
});

libraryRouter.post('/collections/merge', (req, res) => {
  const schema = z.object({
    sourceIds: z.array(z.number().int().positive()).min(1),
    targetId: z.number().int().positive(),
    tagWithSourceNames: z.boolean().optional(),
  });
  const data = parse(schema, req.body);
  res.json(
    mergeCollections(userIdOf(req), data.sourceIds, data.targetId, {
      tagWithSourceNames: data.tagWithSourceNames ?? false,
    }),
  );
});

libraryRouter.post('/collections/convert-to-tags', (req, res) => {
  const schema = z.object({
    collectionIds: z.array(z.number().int().positive()).min(1),
  });
  const data = parse(schema, req.body);
  res.json(convertCollectionsToTags(userIdOf(req), data.collectionIds));
});

libraryRouter.get('/library/uncollected-domains', (req, res) => {
  const limitParsed = req.query.limit ? parseInt(String(req.query.limit), 10) : 25;
  const limit = Math.min(Math.max(Number.isFinite(limitParsed) ? limitParsed : 25, 1), 100);
  res.json({ domains: getUncollectedDomainStats(userIdOf(req), limit) });
});

libraryRouter.post('/library/batch-assign-collection', (req, res) => {
  const schema = z.object({
    bookmarkIds: z.array(z.number().int().positive()).min(1),
    collectionId: z.number().int().positive().nullable(),
  });
  const data = parse(schema, req.body);
  const updatedCount = batchAssignBookmarksToCollection(
    userIdOf(req),
    data.bookmarkIds,
    data.collectionId,
  );
  res.json({ updatedCount });
});

libraryRouter.post('/ai/plan-collections', async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    if (!isAiConfigured(userId)) {
      throw badRequest('Add an OpenAI API key in Settings first.');
    }
    const schema = z.object({
      bookmarkIds: z.array(z.number().int().positive()).optional(),
    });
    res.json(await planCollections(userId, parse(schema, req.body)));
  } catch (error) {
    next(error);
  }
});

libraryRouter.post('/ai/suggest-categories', async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    if (!isAiConfigured(userId)) {
      throw badRequest('Add an OpenAI API key in Settings first.');
    }
    const schema = z.object({
      limit: z.number().int().min(1).max(50).optional(),
      bookmarkIds: z.array(z.number().int().positive()).optional(),
      collections: z.array(z.string().min(1).max(80)).max(40).optional(),
    });
    const data = parse(schema, req.body);
    const result = await suggestBatchCollections(userId, data);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

libraryRouter.post('/ai/suggest-collection-cleanup', async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    if (!isAiConfigured(userId)) {
      throw badRequest('Add an OpenAI API key in Settings first.');
    }
    res.json(await suggestCollectionCleanup(userId));
  } catch (error) {
    next(error);
  }
});

libraryRouter.post('/ai/suggest-tag-cleanup', async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    if (!isAiConfigured(userId)) {
      throw badRequest('Add an OpenAI API key in Settings first.');
    }
    res.json(await suggestTagCleanup(userId));
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
  res.json(applyBatchCategorization(userIdOf(req), data.assignments));
});

libraryRouter.get('/tags', (req, res) => {
  res.json({ tags: listTags(userIdOf(req)) });
});

libraryRouter.patch('/tags/:id', (req, res) => {
  const id = idParam.parse(req.params.id);
  const { name } = parse(z.object({ name: z.string().min(1).max(60) }), req.body);
  res.json({ tag: renameTag(userIdOf(req), id, name) });
});

libraryRouter.post('/tags/merge', (req, res) => {
  const schema = z.object({
    sourceIds: z.array(z.number().int().positive()).min(1),
    target: z.string().min(1).max(60),
  });
  const data = parse(schema, req.body);
  res.json(mergeTags(userIdOf(req), data.sourceIds, data.target));
});

libraryRouter.post('/tags/bulk-delete', (req, res) => {
  const schema = z.object({
    ids: z.array(z.number().int().positive()).min(1).max(1000),
  });
  const data = parse(schema, req.body);
  res.json({ deleted: deleteTags(userIdOf(req), data.ids) });
});

libraryRouter.delete('/tags/:id', (req, res) => {
  deleteTag(userIdOf(req), idParam.parse(req.params.id));
  res.status(204).end();
});

libraryRouter.get('/stats', (req, res) => {
  const userId = userIdOf(req);
  const pinned = (
    db
      .prepare('SELECT COUNT(*) AS count FROM bookmarks WHERE user_id = ? AND is_pinned = 1')
      .get(userId) as { count: number }
  ).count;
  const untagged = (
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM bookmarks b
          WHERE b.user_id = ?
            AND NOT EXISTS (SELECT 1 FROM bookmark_tags bt WHERE bt.bookmark_id = b.id)`,
      )
      .get(userId) as { count: number }
  ).count;
  const uncollected = (
    db
      .prepare('SELECT COUNT(*) AS count FROM bookmarks WHERE user_id = ? AND collection_id IS NULL')
      .get(userId) as { count: number }
  ).count;
  const needsAttention = (
    db
      .prepare("SELECT COUNT(*) AS count FROM bookmarks WHERE user_id = ? AND metadata_status = 'failed'")
      .get(userId) as { count: number }
  ).count;

  res.json({
    total: countBookmarks(userId),
    pinned,
    untagged,
    uncollected,
    needsAttention,
    collections: listCollections(userId).length,
    tags: listTags(userId).length,
    pendingJobs: queueSize(userId),
  });
});

libraryRouter.get('/audit-links', (req, res) => {
  res.json(getAuditStatus(userIdOf(req)));
});

libraryRouter.post('/audit-links', (req, res) => {
  res.json(startLibraryAudit(userIdOf(req)));
});

libraryRouter.post('/audit-links/cancel', (req, res) => {
  res.json({ cancelled: cancelLibraryAudit(userIdOf(req)) });
});

