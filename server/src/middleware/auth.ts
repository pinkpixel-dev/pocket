import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/errors.js';
import { resolveSession } from '../services/sessions.js';
import { needsSetup, type UserRow } from '../services/users.js';

export const SESSION_COOKIE = 'pocket_session';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `attachUser` on every request. Null when nobody is signed in. */
      user?: UserRow | null;
      sessionToken?: string | null;
    }
  }
}

/**
 * A cookie header parser rather than `cookie-parser`. Pocket reads exactly one
 * cookie, and a dependency for that is a dependency to keep patched forever.
 */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function isSecureRequest(req: Request): boolean {
  if (process.env.POCKET_SECURE_COOKIES !== undefined) {
    return ['1', 'true', 'yes', 'on'].includes(process.env.POCKET_SECURE_COOKIES.trim().toLowerCase());
  }
  // `trust proxy` is on, so this follows x-forwarded-proto behind a reverse proxy.
  return req.secure;
}

export function setSessionCookie(req: Request, res: Response, token: string, maxAgeSeconds: number): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    // Lax is what stops another site posting to Pocket with your cookie
    // attached, which is why there is no separate CSRF token here.
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/',
    maxAge: maxAgeSeconds * 1000,
  });
}

export function clearSessionCookie(req: Request, res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/',
  });
}

/** Runs on everything, including routes that do not require an account. */
export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE);
  req.sessionToken = token;
  req.user = resolveSession(token);
  next();
}

/**
 * The 401 body carries `needsSetup`, so a browser opening a fresh install lands
 * on the "create your account" screen instead of a login form nobody can pass.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (req.user) {
    next();
    return;
  }
  next(
    new HttpError(401, needsSetup() ? 'Pocket has not been set up yet.' : 'Sign in to use Pocket.', {
      needsSetup: needsSetup(),
    }),
  );
}

export function requireOwner(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.is_owner === 1) {
    next();
    return;
  }
  next(new HttpError(403, 'Only the owner account can manage other accounts.'));
}

/** Every scoped service takes this. Reaching it without `requireAuth` is a bug. */
export function userIdOf(req: Request): number {
  const id = req.user?.id;
  if (id === undefined) throw new HttpError(401, 'Sign in to use Pocket.');
  return id;
}
