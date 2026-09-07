import { db } from '../db/index.js';
import type { Bookmark, MetadataStatus } from '../lib/types.js';
import { getBookmark, getBookmarkRow } from './bookmarks.js';
import { cacheImage, removeCachedImage } from './images.js';
import { fetchMetadata, MetadataError } from './metadata.js';

export interface EnrichOptions {
  /** A manual refresh overwrites the stored title and description. */
  overwriteText?: boolean;
}

async function firstUsableImage(
  candidates: string[],
  kind: 'preview' | 'favicon',
): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      const cached = await cacheImage(candidate, kind);
      if (cached) return cached.relativePath;
    } catch {
      // A single bad candidate should not stop the others from being tried.
    }
  }
  return null;
}

/** Drops a replaced file once no other bookmark points at it. */
async function releaseIfUnused(relativePath: string | null, keepBookmarkId: number): Promise<void> {
  if (!relativePath) return;
  const { count } = db
    .prepare(
      `SELECT COUNT(*) AS count FROM bookmarks
        WHERE id != ? AND (preview_path = ? OR favicon_path = ?)`,
    )
    .get(keepBookmarkId, relativePath, relativePath) as { count: number };
  if (count === 0) await removeCachedImage(relativePath);
}

const markFailed = db.prepare(
  `UPDATE bookmarks
      SET metadata_status = 'failed',
          metadata_error = @error,
          metadata_fetched_at = datetime('now'),
          updated_at = datetime('now')
    WHERE id = @id`,
);

export async function enrichBookmark(id: number, options: EnrichOptions = {}): Promise<Bookmark | null> {
  const row = getBookmarkRow(id);
  if (!row) return null;

  let metadata;
  try {
    metadata = await fetchMetadata(row.url);
  } catch (error) {
    const message =
      error instanceof MetadataError || error instanceof Error
        ? error.message
        : 'The page could not be read.';
    markFailed.run({ id, error: message.slice(0, 400) });
    return getBookmark(id);
  }

  const previewPath = await firstUsableImage(metadata.imageCandidates, 'preview');
  const faviconPath = await firstUsableImage(metadata.faviconCandidates, 'favicon');

  const stillThere = getBookmarkRow(id);
  if (!stillThere) return null;

  const title = options.overwriteText || !stillThere.title ? metadata.title || stillThere.title : stillThere.title;
  const description =
    options.overwriteText || !stillThere.description
      ? metadata.description || stillThere.description
      : stillThere.description;

  const status: MetadataStatus = title && previewPath ? 'ok' : 'partial';

  db.prepare(
    `UPDATE bookmarks
        SET title = @title,
            description = @description,
            site_name = @siteName,
            preview_path = COALESCE(@previewPath, preview_path),
            favicon_path = COALESCE(@faviconPath, favicon_path),
            metadata_status = @status,
            metadata_error = NULL,
            metadata_fetched_at = datetime('now'),
            updated_at = datetime('now')
      WHERE id = @id`,
  ).run({
    id,
    title,
    description,
    siteName: metadata.siteName || stillThere.site_name,
    previewPath,
    faviconPath,
    status,
  });

  if (previewPath && previewPath !== stillThere.preview_path) {
    await releaseIfUnused(stillThere.preview_path, id);
  }
  if (faviconPath && faviconPath !== stillThere.favicon_path) {
    await releaseIfUnused(stillThere.favicon_path, id);
  }

  return getBookmark(id);
}
