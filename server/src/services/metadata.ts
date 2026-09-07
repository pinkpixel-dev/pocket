import * as cheerio from 'cheerio';
import { fetchHtml, FetchError } from '../lib/http.js';
import { domainOf } from '../lib/url.js';

export interface PageMetadata {
  finalUrl: string;
  title: string;
  description: string;
  siteName: string;
  /** Best candidates first; the caller downloads until one works. */
  imageCandidates: string[];
  faviconCandidates: string[];
}

function clean(value: string | undefined | null, limit: number): string {
  if (!value) return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, limit);
}

function absolute(candidate: string | undefined, base: string): string | null {
  if (!candidate) return null;
  const trimmed = candidate.trim();
  if (!trimmed || trimmed.startsWith('data:')) return null;
  try {
    const url = new URL(trimmed, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Pulls the first URL out of a srcset, which is the largest in most templates. */
function fromSrcset(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.split(',')[0]?.trim().split(/\s+/)[0];
}

export function parseMetadata(html: string, pageUrl: string): PageMetadata {
  const $ = cheerio.load(html);

  const meta = (selector: string): string | undefined =>
    $(selector).attr('content') ?? undefined;

  const title =
    clean(meta('meta[property="og:title"]'), 300) ||
    clean(meta('meta[name="twitter:title"]'), 300) ||
    clean($('title').first().text(), 300) ||
    clean($('h1').first().text(), 300);

  const description =
    clean(meta('meta[property="og:description"]'), 600) ||
    clean(meta('meta[name="description"]'), 600) ||
    clean(meta('meta[name="twitter:description"]'), 600);

  const siteName = clean(meta('meta[property="og:site_name"]'), 120) || domainOf(pageUrl);

  const rawImages = [
    meta('meta[property="og:image:secure_url"]'),
    meta('meta[property="og:image:url"]'),
    meta('meta[property="og:image"]'),
    meta('meta[name="twitter:image:src"]'),
    meta('meta[name="twitter:image"]'),
    meta('meta[itemprop="image"]'),
    $('link[rel="image_src"]').attr('href'),
    fromSrcset($('article img[srcset]').first().attr('srcset')),
    $('article img[src]').first().attr('src'),
    fromSrcset($('img[srcset]').first().attr('srcset')),
  ];

  const rawFavicons = [
    $('link[rel="apple-touch-icon"]').attr('href'),
    $('link[rel="apple-touch-icon-precomposed"]').attr('href'),
    $('link[rel="icon"][sizes]').attr('href'),
    $('link[rel="icon"]').attr('href'),
    $('link[rel="shortcut icon"]').attr('href'),
    $('link[rel="mask-icon"]').attr('href'),
    '/favicon.ico',
  ];

  const dedupe = (values: Array<string | undefined>): string[] => {
    const out: string[] = [];
    for (const value of values) {
      const resolved = absolute(value, pageUrl);
      if (resolved && !out.includes(resolved)) out.push(resolved);
    }
    return out.slice(0, 6);
  };

  return {
    finalUrl: pageUrl,
    title,
    description,
    siteName,
    imageCandidates: dedupe(rawImages),
    faviconCandidates: dedupe(rawFavicons),
  };
}

export class MetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetadataError';
  }
}

export async function fetchMetadata(url: string): Promise<PageMetadata> {
  let result;
  try {
    result = await fetchHtml(url);
  } catch (error) {
    if (error instanceof FetchError) throw new MetadataError(error.message);
    throw error;
  }

  if (result.status >= 400) {
    throw new MetadataError(`${new URL(url).hostname} answered with HTTP ${result.status}.`);
  }

  const isHtml =
    result.contentType.includes('html') || result.contentType === '' || result.contentType.includes('xml');

  if (!isHtml) {
    // A direct link to a PDF or an image still deserves a sensible title.
    const name = decodeURIComponent(new URL(result.finalUrl).pathname.split('/').filter(Boolean).pop() ?? '');
    return {
      finalUrl: result.finalUrl,
      title: clean(name, 300),
      description: '',
      siteName: domainOf(result.finalUrl),
      imageCandidates: result.contentType.startsWith('image/') ? [result.finalUrl] : [],
      faviconCandidates: [new URL('/favicon.ico', result.finalUrl).href],
    };
  }

  return parseMetadata(result.body.toString('utf8'), result.finalUrl);
}
