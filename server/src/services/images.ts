import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { fetchImage } from '../lib/http.js';

export type ImageKind = 'preview' | 'favicon' | 'cover';

interface SniffResult {
  extension: string;
  mimeType: string;
}

/**
 * Trusting `content-type` alone lets a server hand us anything, so the bytes
 * decide what the file actually is.
 */
function sniffImage(buffer: Buffer): SniffResult | null {
  if (buffer.length < 12) return null;

  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: '.png', mimeType: 'image/png' };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: '.jpg', mimeType: 'image/jpeg' };
  }
  if (buffer.subarray(0, 6).toString('ascii') === 'GIF89a' || buffer.subarray(0, 6).toString('ascii') === 'GIF87a') {
    return { extension: '.gif', mimeType: 'image/gif' };
  }
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { extension: '.webp', mimeType: 'image/webp' };
  }
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii');
    if (brand.startsWith('avif') || brand.startsWith('avis')) return { extension: '.avif', mimeType: 'image/avif' };
    if (brand.startsWith('heic') || brand.startsWith('heix') || brand.startsWith('mif1')) {
      return { extension: '.heic', mimeType: 'image/heic' };
    }
  }
  if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) {
    return { extension: '.ico', mimeType: 'image/x-icon' };
  }
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return { extension: '.bmp', mimeType: 'image/bmp' };
  }

  const head = buffer.subarray(0, 400).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
    return { extension: '.svg', mimeType: 'image/svg+xml' };
  }
  return null;
}

const FOLDERS: Record<ImageKind, string> = {
  preview: 'previews',
  favicon: 'favicons',
  cover: 'covers',
};

const DIRECTORIES: Record<ImageKind, string> = {
  preview: config.previewsDir,
  favicon: config.faviconsDir,
  cover: config.coversDir,
};

/** A preview this small is a tracking pixel or a broken placeholder, not art. */
const MIN_BYTES: Record<ImageKind, number> = { preview: 1024, favicon: 48, cover: 1024 };

export interface CachedImage {
  /** Stored as `previews/<name>` so it can be joined to the media route. */
  relativePath: string;
  bytes: number;
  mimeType: string;
}

/**
 * Writes bytes we already hold into the cache. The name is the hash of the
 * content, so saving the same picture twice costs one file.
 */
export async function storeImage(buffer: Buffer, kind: ImageKind): Promise<CachedImage | null> {
  if (buffer.length < MIN_BYTES[kind]) return null;

  const sniffed = sniffImage(buffer);
  if (!sniffed) return null;

  // An SVG can carry script, so it is only ever served as a download-safe file.
  const digest = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 32);
  const fileName = `${digest}${sniffed.extension}`;
  const target = path.join(DIRECTORIES[kind], fileName);

  try {
    await fs.access(target);
  } catch {
    await fs.writeFile(target, buffer);
  }

  return {
    relativePath: `${FOLDERS[kind]}/${fileName}`,
    bytes: buffer.length,
    mimeType: sniffed.mimeType,
  };
}

export async function cacheImage(sourceUrl: string, kind: ImageKind): Promise<CachedImage | null> {
  const result = await fetchImage(sourceUrl);
  if (result.status >= 400 || result.truncated || result.body.length === 0) return null;

  return storeImage(result.body, kind);
}

/**
 * Removes a cached file once nothing references it. Content-addressed names
 * mean two bookmarks can share one file, so the caller passes the reference
 * count it already knows.
 */
export async function removeCachedImage(relativePath: string | null | undefined): Promise<void> {
  if (!relativePath) return;
  const [folder, name] = relativePath.split('/');
  const kind = (Object.keys(FOLDERS) as ImageKind[]).find((key) => FOLDERS[key] === folder);
  if (!name || !kind) return;
  if (name.includes('..') || name.includes('/')) return;

  await fs.rm(path.join(DIRECTORIES[kind], name), { force: true });
}
