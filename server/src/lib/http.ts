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

/**
 * A fetch that ran out of time. Kept apart from FetchError because running out
 * of patience is not evidence that a link is dead, and the probe needs to tell
 * the two apart.
 */
export class TimeoutError extends FetchError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'TimeoutError';
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
  /** Overrides the crawler string. Only the link probe uses this. */
  userAgent?: string;
  /** Whole-call budget, redirects included. Defaults to the configured one. */
  timeoutMs?: number;
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
  const budget = options.timeoutMs ?? config.fetch.timeoutMs;
  const deadline = Date.now() + budget;
  const seconds = Math.round(budget / 1000);

  /*
   * The agent's headersTimeout and bodyTimeout only start counting once a
   * socket is up, so a DNS lookup that never answers or a connect that never
   * completes used to hang with nothing to stop it. This signal covers the
   * whole call instead, which is what keeps one bad host from sitting on a
   * queue slot indefinitely.
   */
  const expiry = AbortSignal.timeout(budget);
  const signal = options.signal ? AbortSignal.any([options.signal, expiry]) : expiry;

  for (let hop = 0; hop <= config.fetch.maxRedirects; hop += 1) {
    assertFetchable(current);
    if (Date.now() >= deadline) throw new FetchError(`Timed out fetching ${startUrl} after ${seconds}s`);

    let response: Awaited<ReturnType<typeof request>>;
    try {
      // undici does not follow redirects unless an interceptor is added, which
      // is what we want: every hop is re-checked by the loop above.
      response = await request(current.href, {
        dispatcher: agent,
        method: 'GET',
        signal,
        headers: {
          accept: options.accept,
          'accept-language': 'en',
          'user-agent': options.userAgent ?? config.fetch.userAgent,
        },
      });
    } catch (error) {
      if (error instanceof BlockedAddressError) throw new FetchError(error.message, error);
      if (expiry.aborted) throw new TimeoutError(`${current.hostname} did not answer within ${seconds}s`, error);
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
    } catch (error) {
      if (expiry.aborted) throw new TimeoutError(`${current.hostname} stopped sending within ${seconds}s`, error);
      const reason = error instanceof Error ? error.message : String(error);
      throw new FetchError(`Could not read the response from ${current.hostname}: ${reason}`, error);
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

/**
 * `dead` is reserved for links that are genuinely gone. `unknown` covers the
 * cases where the check learned nothing useful, and nothing gets flagged on
 * that, because a wrong "broken link" badge is worse than a missing one.
 */
export type ProbeVerdict = 'alive' | 'dead' | 'unknown';

export interface ProbeResult {
  verdict: ProbeVerdict;
  /** 0 when no response arrived at all. */
  status: number;
  /** Why it was called dead or unknown. Null when the link is fine. */
  error: string | null;
}

/**
 * The host answered, it just would not serve us: a bot filter, a login wall,
 * a rate limit, a method it dislikes. None of that says the bookmark is dead,
 * and treating it as dead is what put a "broken link" badge on working sites.
 */
const REFUSED_STATUSES = new Set([401, 402, 403, 405, 406, 409, 418, 429, 451, 999]);

/** The only answers that actually mean the page is gone. */
const GONE_STATUSES = new Set([404, 410]);

interface Attempt {
  result: ProbeResult;
  /** True when a second look with a browser string is worth the request. */
  retry: boolean;
}

function classify(url: string, status: number): Attempt {
  const host = new URL(url).hostname;

  if (status < 400) return { result: { verdict: 'alive', status, error: null }, retry: false };

  if (GONE_STATUSES.has(status)) {
    return {
      result: { verdict: 'dead', status, error: `${host} answered with HTTP ${status}` },
      retry: false,
    };
  }

  if (REFUSED_STATUSES.has(status)) {
    return {
      result: { verdict: 'alive', status, error: null },
      retry: true,
    };
  }

  // A 5xx means the site is up and having a bad day, which is not the same as
  // a bookmark worth deleting. Everything else unrecognised lands here too.
  return {
    result: { verdict: 'unknown', status, error: `${host} answered with HTTP ${status}` },
    retry: status >= 500,
  };
}

async function attemptProbe(url: string, timeoutMs: number, userAgent: string): Promise<Attempt> {
  try {
    const result = await safeFetch(url, {
      maxBytes: 16 * 1024,
      accept: '*/*',
      timeoutMs,
      userAgent,
    });
    return classify(url, result.status);
  } catch (error) {
    const host = new URL(url).hostname;

    // Out of time tells us about the network between here and there, not about
    // the link, so it is never enough on its own to condemn one.
    if (error instanceof TimeoutError) {
      return {
        result: {
          verdict: 'unknown',
          status: 0,
          error: `${host} did not respond within ${Math.round(timeoutMs / 1000)}s`,
        },
        retry: true,
      };
    }

    // No DNS record, refused connection, broken TLS: the host itself is not
    // there, and a different user agent will not change that.
    return {
      result: {
        verdict: 'dead',
        status: 0,
        error: error instanceof Error ? error.message : String(error),
      },
      retry: false,
    };
  }
}

/**
 * Lightweight health check on a link, bounded by a small byte limit and a
 * short timeout. A refusal or a stall gets one more attempt as a browser
 * before the answer is taken as final.
 */
export async function probeUrl(url: string, timeoutMs = 8000): Promise<ProbeResult> {
  const first = await attemptProbe(url, timeoutMs, config.fetch.userAgent);
  if (!first.retry) return first.result;

  const second = await attemptProbe(url, timeoutMs, config.fetch.probeUserAgent);
  // The browser string got the more honest answer, so it wins, unless it came
  // back with nothing useful and the first attempt had something to say.
  return second.result.verdict === 'unknown' && first.result.verdict !== 'unknown'
    ? first.result
    : second.result;
}
