import { Router } from 'express';
import { z } from 'zod';
import { HttpError, badRequest } from '../lib/errors.js';
import { verifyPassword } from '../lib/auth.js';
import {
  clearSessionCookie,
  requireAuth,
  requireOwner,
  setSessionCookie,
  userIdOf,
} from '../middleware/auth.js';
import {
  claimOwner,
  createUser,
  deleteUser,
  findUserByUsername,
  listUsers,
  needsSetup,
  setDisplayName,
  setPassword,
  toPublicUser,
} from '../services/users.js';
import { endAllSessionsFor, endSession, startSession } from '../services/sessions.js';

export const authRouter = Router();

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw badRequest(result.error.issues[0]?.message ?? 'That request could not be understood.');
  }
  return result.data;
}

const credentials = z.object({
  username: z.string().min(1, 'Enter a username.').max(64),
  password: z.string().min(1, 'Enter a password.').max(200),
  displayName: z.string().max(60).optional(),
});

/**
 * A small in-memory throttle on failed sign-ins. Pocket sits on a home network
 * and restarts rarely enough that this is worth having, and losing the counters
 * on restart is not a problem worth a table for.
 */
const FAILURE_LIMIT = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; firstAt: number }>();

function throttleKey(ip: string, username: string): string {
  return `${ip}|${username.toLowerCase()}`;
}

function checkThrottle(key: string): void {
  const entry = failures.get(key);
  if (!entry) return;
  if (Date.now() - entry.firstAt > FAILURE_WINDOW_MS) {
    failures.delete(key);
    return;
  }
  if (entry.count >= FAILURE_LIMIT) {
    throw new HttpError(429, 'Too many failed sign-in attempts. Wait fifteen minutes and try again.');
  }
}

function recordFailure(key: string): void {
  const entry = failures.get(key);
  if (!entry || Date.now() - entry.firstAt > FAILURE_WINDOW_MS) {
    failures.set(key, { count: 1, firstAt: Date.now() });
    return;
  }
  entry.count += 1;
}

/** Told to the browser before anyone signs in, so it knows which screen to show. */
authRouter.get('/auth/session', (req, res) => {
  res.json({
    needsSetup: needsSetup(),
    user: req.user ? toPublicUser(req.user) : null,
  });
});

authRouter.post('/auth/setup', async (req, res, next) => {
  try {
    if (!needsSetup()) throw badRequest('Pocket has already been set up. Sign in instead.');

    const input = parse(credentials, req.body);
    const user = await claimOwner(input);

    const session = startSession(user.id, String(req.headers['user-agent'] ?? ''));
    setSessionCookie(req, res, session.token, session.maxAgeSeconds);
    res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/auth/login', async (req, res, next) => {
  try {
    const input = parse(credentials.pick({ username: true, password: true }), req.body);
    const key = throttleKey(req.ip ?? 'unknown', input.username);
    checkThrottle(key);

    const row = findUserByUsername(input.username);
    // The password is checked even for a username that does not exist, so a
    // wrong username and a wrong password take the same time to answer.
    const ok = await verifyPassword(input.password, row?.password_hash ?? null);

    if (!row || row.password_hash === null || !ok) {
      recordFailure(key);
      throw new HttpError(401, 'That username and password did not match.');
    }

    failures.delete(key);
    const session = startSession(row.id, String(req.headers['user-agent'] ?? ''));
    setSessionCookie(req, res, session.token, session.maxAgeSeconds);
    res.json({ user: toPublicUser(row) });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/auth/logout', (req, res) => {
  endSession(req.sessionToken ?? null);
  clearSessionCookie(req, res);
  res.status(204).end();
});

authRouter.patch('/auth/profile', requireAuth, (req, res) => {
  const { displayName } = parse(z.object({ displayName: z.string().max(60) }), req.body);
  res.json({ user: setDisplayName(userIdOf(req), displayName) });
});

/**
 * Changing your own password signs out every other session, which is the only
 * useful thing to do about a device you no longer trust.
 */
authRouter.post('/auth/password', requireAuth, async (req, res, next) => {
  try {
    const input = parse(
      z.object({
        currentPassword: z.string().min(1, 'Enter your current password.').max(200),
        newPassword: z.string().min(1, 'Enter a new password.').max(200),
      }),
      req.body,
    );

    const user = req.user!;
    if (!(await verifyPassword(input.currentPassword, user.password_hash))) {
      throw new HttpError(401, 'That is not your current password.');
    }

    await setPassword(user.id, input.newPassword);
    const endedElsewhere = endAllSessionsFor(user.id, req.sessionToken ?? null);
    res.json({ ok: true, signedOutElsewhere: endedElsewhere });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/users', requireAuth, requireOwner, (_req, res) => {
  res.json({ users: listUsers() });
});

authRouter.post('/users', requireAuth, requireOwner, async (req, res, next) => {
  try {
    res.status(201).json({ user: await createUser(parse(credentials, req.body)) });
  } catch (error) {
    next(error);
  }
});

/** The owner's reset, for the person who forgot theirs. Ends their sessions too. */
authRouter.post('/users/:id/password', requireAuth, requireOwner, async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { newPassword } = parse(
      z.object({ newPassword: z.string().min(1, 'Enter a new password.').max(200) }),
      req.body,
    );

    await setPassword(id, newPassword);
    endAllSessionsFor(id, id === req.user?.id ? (req.sessionToken ?? null) : null);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

authRouter.delete('/users/:id', requireAuth, requireOwner, async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    if (id === req.user?.id) throw badRequest('You cannot delete the account you are signed in with.');

    await deleteUser(id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
