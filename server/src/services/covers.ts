import { db } from '../db/index.js';
import { badRequest, notFound } from '../lib/errors.js';
import { parseUrl } from '../lib/url.js';
import type { Bookmark } from '../lib/types.js';
import { getBookmark, getBookmarkRow, releaseImage } from './bookmarks.js';
import { cacheImage, storeImage } from './images.js';

const UNREADABLE = 'That is not an image Pocket can read. Try a PNG, JPEG, GIF, WebP or AVIF.';

const setCoverPath = db.prepare(
  `UPDATE bookmarks
      SET cover_path = @coverPath,
          updated_at = datetime('now')
    WHERE id = @id`,
);

/**
 * Points the bookmark at a new cover and drops the old file if nothing else
 * uses it. Passing null clears the cover, which uncovers the fetched preview
 * again rather than leaving the card blank.
 */
async function applyCover(id: number, coverPath: string | null): Promise<Bookmark> {
  const row = getBookmarkRow(id);
  if (!row) throw notFound('That bookmark no longer exists.');

  setCoverPath.run({ id, coverPath });

  if (row.cover_path && row.cover_path !== coverPath) {
    await releaseImage(row.cover_path, id);
  }
  return getBookmark(id);
}

export async function setCoverFromUpload(id: number, buffer: Buffer): Promise<Bookmark> {
  if (!getBookmarkRow(id)) throw notFound('That bookmark no longer exists.');

  const stored = await storeImage(buffer, 'cover');
  if (!stored) throw badRequest(UNREADABLE);

  return applyCover(id, stored.relativePath);
}

/**
 * Fetching by URL goes through the same guarded client as everything else, so
 * a pasted link cannot be used to reach something on the local network.
 */
export async function setCoverFromUrl(id: number, imageUrl: string): Promise<Bookmark> {
  if (!getBookmarkRow(id)) throw notFound('That bookmark no longer exists.');

  const url = parseUrl(imageUrl);
  let stored;
  try {
    stored = await cacheImage(url.href, 'cover');
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : 'That image could not be downloaded.');
  }
  if (!stored) throw badRequest('That link did not return an image Pocket can read.');

  return applyCover(id, stored.relativePath);
}

export function removeCover(id: number): Promise<Bookmark> {
  return applyCover(id, null);
}
