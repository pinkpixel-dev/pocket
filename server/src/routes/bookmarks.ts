import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import {
  createBookmark,
  deleteBookmark,
  getBookmark,
  listBookmarks,
  setPinned,
  updateBookmark,
} from '../services/bookmarks.js';
import { removeCover, setCoverFromUpload, setCoverFromUrl } from '../services/covers.js';
import { enqueueAiFill, enqueueEnrich } from '../services/queue.js';
import { enrichBookmark } from '../services/enrich.js';
import { isAiConfigured } from '../services/settings.js';
import { badRequest } from '../lib/errors.js';
import type { SortKey } from '../lib/types.js';

export const bookmarksRouter = Router();

const coverMegabytes = Math.round(config.maxCoverBytes / 1024 / 1024);

const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxCoverBytes, files: 1 },
}).single('file');

/**
 * Multer's own size error would otherwise surface as the import message, which
 * names a different limit and would confuse anyone who hit it from a card.
 */
function acceptCover(req: Request, res: Response, next: NextFunction): void {
  coverUpload(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      next(badRequest(`That image is larger than the ${coverMegabytes} MB limit.`));
      return;
    }
    next(error);
  });
}

const SORT_KEYS: SortKey[] = ['newest', 'oldest', 'title', 'domain', 'updated'];

const idParam = z.coerce.number().int().positive();

const tagsSchema = z.union([z.array(z.string()), z.string()]).optional();

const createSchema = z.object({
  url: z.string().min(1, 'A URL is required.'),
  title: z.string().max(300).optional(),
  description: z.string().max(600).optional(),
  collectionId: z.coerce.number().int().positive().nullable().optional(),
  tags: tagsSchema,
  isPinned: z.boolean().optional(),
  fetchMetadata: z.boolean().optional(),
});

const updateSchema = z.object({
  url: z.string().min(1).optional(),
  title: z.string().max(300).optional(),
  description: z.string().max(600).optional(),
  collectionId: z.coerce.number().int().positive().nullable().optional(),
  tags: tagsSchema,
  isPinned: z.boolean().optional(),
});

function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw badRequest(first?.message ?? 'That request could not be understood.', result.error.issues);
  }
  return result.data;
}

bookmarksRouter.get('/', (req, res) => {
  const { q, collection, tag, pinned, sort, limit, offset } = req.query;
  const sortKey = typeof sort === 'string' && SORT_KEYS.includes(sort as SortKey) ? (sort as SortKey) : 'newest';

  const page = listBookmarks({
    search: typeof q === 'string' ? q : undefined,
    collectionId: collection === 'none' ? undefined : collection ? Number(collection) : undefined,
    uncollected: collection === 'none',
    tag: tag === 'none' ? undefined : typeof tag === 'string' ? tag : undefined,
    untagged: tag === 'none',
    pinned: pinned === '1' || pinned === 'true',
    sort: sortKey,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });

  res.json(page);
});

bookmarksRouter.post('/', (req, res) => {
  const input = parseBody(createSchema, req.body);
  const result = createBookmark(input);

  if (!result.created) {
    res.status(409).json({
      error: 'You already saved this link.',
      duplicate: true,
      bookmark: result.bookmark,
    });
    return;
  }

  if (input.fetchMetadata !== false) enqueueEnrich(result.bookmark.id);
  res.status(201).json({ bookmark: result.bookmark });
});

bookmarksRouter.get('/:id', (req, res) => {
  res.json({ bookmark: getBookmark(idParam.parse(req.params.id)) });
});

bookmarksRouter.patch('/:id', (req, res) => {
  const id = idParam.parse(req.params.id);
  const input = parseBody(updateSchema, req.body);
  const bookmark = updateBookmark(id, input);

  // A changed URL invalidates the cached preview, so fetch it again.
  if (input.url !== undefined) enqueueEnrich(id, { overwriteText: !input.title });
  res.json({ bookmark });
});

bookmarksRouter.delete('/:id', async (req, res) => {
  await deleteBookmark(idParam.parse(req.params.id));
  res.status(204).end();
});

bookmarksRouter.post('/:id/pin', (req, res) => {
  const id = idParam.parse(req.params.id);
  const { isPinned } = parseBody(z.object({ isPinned: z.boolean() }), req.body);
  res.json({ bookmark: setPinned(id, isPinned) });
});

bookmarksRouter.post('/:id/refresh', async (req, res) => {
  const id = idParam.parse(req.params.id);
  getBookmark(id);
  const { bookmark } = await enrichBookmark(id, { overwriteText: true });
  res.json({ bookmark: bookmark ?? getBookmark(id) });
});

/**
 * One route for both ways of choosing a cover. A multipart request carries the
 * file itself; a JSON body carries a link Pocket downloads on your behalf.
 */
bookmarksRouter.post('/:id/cover', acceptCover, async (req, res) => {
  const id = idParam.parse(req.params.id);

  if (req.file) {
    res.json({ bookmark: await setCoverFromUpload(id, req.file.buffer) });
    return;
  }

  const { imageUrl } = parseBody(z.object({ imageUrl: z.string().min(1) }), req.body ?? {});
  res.json({ bookmark: await setCoverFromUrl(id, imageUrl) });
});

bookmarksRouter.delete('/:id/cover', async (req, res) => {
  res.json({ bookmark: await removeCover(idParam.parse(req.params.id)) });
});

/**
 * Queued rather than awaited: the model can think for a while, and the card
 * already knows how to show a pending state and poll for the result.
 */
bookmarksRouter.post('/:id/ai', (req, res) => {
  const id = idParam.parse(req.params.id);
  const bookmark = getBookmark(id);
  if (!isAiConfigured()) throw badRequest('Add an OpenAI key in Settings first.');

  enqueueAiFill(id);
  res.status(202).json({ bookmark: { ...bookmark, aiStatus: 'pending', aiError: null } });
});
