import { Router } from 'express';
import { z } from 'zod';
import {
  createCollection,
  deleteCollection,
  listCollections,
  updateCollection,
} from '../services/collections.js';
import { deleteTag, listTags, renameTag } from '../services/tags.js';
import { countBookmarks } from '../services/bookmarks.js';
import { db } from '../db/index.js';
import { queueSize } from '../services/queue.js';
import { badRequest } from '../lib/errors.js';

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
