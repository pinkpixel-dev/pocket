import net from 'node:net';
import { Agent, request } from 'undici';
import { config } from '../config.js';
import { guardedLookup, isBlockedAddress, BlockedAddressError } from './ssrf.js';

/**
 * Every outbound request from Pocket goes through this agent, so the address
 * guard cannot be bypassed by a redirect or a slow DNS change.
 */
const agent = new Agent({
  connect: { lookup: guardedLookup, timeout: 8_000 },
  headersTimeout: config.fetch.timeoutMs,
  bodyTimeout: config.fetch.timeoutMs,
});

export class FetchError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

export interface FetchResult {
  finalUrl: string;
  status: number;
  contentType: string;
  body: Buffer;
  truncated: boolean;
}

interface FetchOptions {
  maxBytes: number;
  accept: string;
  signal?: AbortSignal;
}

/**
 * Destroying a body we did not finish reading makes undici emit an `error`
 * event on the stream. With no listener attached that becomes an uncaught
 * exception and takes the process down, so the listener goes on first.
 */
function discardBody(body: { on(event: 'error', listener: () => void): unknown; destroy(): unknown }): void {
  body.on('error', () => {});
  body.destroy();
}

function assertFetchable(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FetchError(`Refusing to fetch a ${url.protocol} URL.`);
  }
  // A literal address never reaches the DNS lookup, so it is checked here
  // instead. Anything with a real hostname is caught at connect time.
  if (net.isIP(url.hostname) !== 0 && isBlockedAddress(url.hostname)) {
    throw new FetchError(new BlockedAddressError(url.hostname, url.hostname).message);
  }
}

/**
 * Follows redirects by hand so each hop is re-checked, and stops reading as
 * soon as the response passes the byte budget rather than buffering it all.
 */
export async function safeFetch(startUrl: string, options: FetchOptions): Promise<FetchResult> {
  let current = new URL(startUrl);
  const deadline = Date.now() + config.fetch.timeoutMs;

  for (let hop = 0; hop <= config.fetch.maxRedirects; hop += 1) {
    assertFetchable(current);
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new FetchError(`Timed out fetching ${startUrl}`);

    let response: Awaited<ReturnType<typeof request>>;
    try {
      // undici does not follow redirects unless an interceptor is added, which
      // is what we want: every hop is re-checked by the loop above.
      response = await request(current.href, {
        dispatcher: agent,
        method: 'GET',
        signal: options.signal,
        headers: {
          accept: options.accept,
          'accept-language': 'en',
          'user-agent': config.fetch.userAgent,
        },
      });
    } catch (error) {
      if (error instanceof BlockedAddressError) throw new FetchError(error.message, error);
      const reason = error instanceof Error ? error.message : String(error);
      throw new FetchError(`Could not reach ${current.hostname}: ${reason}`, error);
    }

    const status = response.statusCode;
    const location = response.headers['location'];
    if (status >= 300 && status < 400 && typeof location === 'string' && location) {
      discardBody(response.body);
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new FetchError(`Got an unusable redirect from ${current.hostname}.`);
      }
      current = next;
      continue;
    }

    const rawType = response.headers['content-type'];
    const contentType = (Array.isArray(rawType) ? rawType[0] : rawType) ?? '';

    const declared = Number(response.headers['content-length']);
    if (Number.isFinite(declared) && declared > options.maxBytes) {
      discardBody(response.body);
      throw new FetchError(`${current.hostname} returned ${declared} bytes, over the ${options.maxBytes} byte limit.`);
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let truncated = false;
    try {
      for await (const chunk of response.body) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > options.maxBytes) {
          chunks.push(buffer.subarray(0, buffer.length - (size - options.maxBytes)));
          truncated = true;
          break;
        }
        chunks.push(buffer);
      }
    } finally {
      discardBody(response.body);
    }

    return {
      finalUrl: current.href,
      status,
      contentType: contentType.split(';')[0]?.trim().toLowerCase() ?? '',
      body: Buffer.concat(chunks),
      truncated,
    };
  }

  throw new FetchError(`Too many redirects starting from ${startUrl}`);
}

export function fetchHtml(url: string, signal?: AbortSignal): Promise<FetchResult> {
  return safeFetch(url, {
    maxBytes: config.fetch.maxHtmlBytes,
    accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
    signal,
  });
}

/**
 * A reasoning model can think for a while before the first byte arrives, so
 * the API call gets its own agent with a much longer patience than a metadata
 * fetch. The address guard is the same one, because an API base URL is still
 * a URL somebody can point wherever they like.
 */
const apiAgent = new Agent({
  connect: { lookup: guardedLookup, timeout: 8_000 },
  headersTimeout: config.openai.timeoutMs,
  bodyTimeout: config.openai.timeoutMs,
});

export interface JsonResponse {
  status: number;
  body: unknown;
}

/** POSTs JSON and reads JSON back. Redirects are refused rather than followed. */
export async function postJson(
  url: string,
  payload: unknown,
  headers: Record<string, string>,
): Promise<JsonResponse> {
  const target = new URL(url);
  assertFetchable(target);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.openai.timeoutMs);

  try {
    const response = await request(target.href, {
      dispatcher: apiAgent,
      method: 'POST',
      signal: controller.signal,
      headers: { ...headers, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await response.body.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Left as text so the caller can put something useful in the error.
    }
    return { status: response.statusCode, body };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new FetchError(`${target.hostname} did not answer within ${config.openai.timeoutMs / 1000}s.`);
    }
    if (error instanceof BlockedAddressError) throw new FetchError(error.message, error);
    const reason = error instanceof Error ? error.message : String(error);
    throw new FetchError(`Could not reach ${target.hostname}: ${reason}`, error);
  } finally {
    clearTimeout(timer);
  }
}

export function fetchImage(url: string, signal?: AbortSignal): Promise<FetchResult> {
  return safeFetch(url, {
    maxBytes: config.fetch.maxImageBytes,
    accept: 'image/avif,image/webp,image/png,image/jpeg,image/svg+xml,image/*;q=0.8',
    signal,
  });
}

export interface ProbeResult {
  alive: boolean;
  status: number;
  error: string | null;
}

/** Lightweight health check on a link, bounded by a small byte limit and short timeout. */
export async function probeUrl(url: string, timeoutMs = 6000): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await safeFetch(url, {
      maxBytes: 16 * 1024,
      accept: '*/*',
      signal: controller.signal,
    });

    if (result.status >= 400) {
      return {
        alive: false,
        status: result.status,
        error: `${new URL(url).hostname} answered with HTTP ${result.status}`,
      };
    }

    return { alive: true, status: result.status, error: null };
  } catch (error) {
    if (controller.signal.aborted) {
      return {
        alive: false,
        status: 0,
        error: `${new URL(url).hostname} did not respond within ${Math.round(timeoutMs / 1000)}s`,
      };
    }
    return {
      alive: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

