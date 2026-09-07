import { badRequest } from './errors.js';

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_name',
  'gclid',
  'fbclid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'ref_src',
  'spm',
  'yclid',
  'msclkid',
  'vero_id',
  '_hsenc',
  '_hsmi',
]);

/**
 * Accepts what a person is likely to paste and returns a usable absolute URL.
 * A bare `example.com/page` gets an https:// prefix; anything that is not
 * http(s) after that is rejected.
 */
export function parseUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed) throw badRequest('A URL is required.');

  let candidate = trimmed;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) candidate = `https://${candidate}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw badRequest(`That does not look like a URL: ${trimmed}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw badRequest('Only http and https links can be saved.');
  }
  if (!url.hostname || !url.hostname.includes('.')) {
    if (url.hostname !== 'localhost') throw badRequest(`That does not look like a URL: ${trimmed}`);
  }
  return url;
}

/**
 * A comparison key for duplicate detection. The bookmark keeps the URL the
 * user actually gave it; only this derived form is normalized.
 */
export function normalizeUrl(url: URL): string {
  const normalized = new URL(url.href);
  normalized.protocol = normalized.protocol.toLowerCase();
  normalized.hostname = normalized.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  normalized.hash = '';

  if (
    (normalized.protocol === 'https:' && normalized.port === '443') ||
    (normalized.protocol === 'http:' && normalized.port === '80')
  ) {
    normalized.port = '';
  }

  for (const key of [...normalized.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) normalized.searchParams.delete(key);
  }
  normalized.searchParams.sort();

  if (normalized.pathname.length > 1 && normalized.pathname.endsWith('/')) {
    normalized.pathname = normalized.pathname.replace(/\/+$/, '');
  }

  // Treat http and https as the same page: people paste both for the same link.
  const search = normalized.search === '?' ? '' : normalized.search;
  return `${normalized.hostname}${normalized.pathname}${search}`;
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
