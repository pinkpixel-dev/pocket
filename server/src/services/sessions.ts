import { db } from '../db/index.js';
import { createSessionToken, hashSessionToken } from '../lib/auth.js';
import { findUserById, type UserRow } from './users.js';

/** A month. Long enough that a phone on the home screen stays signed in. */
const SESSION_DAYS = 30;

/**
 * How stale `expires_at` may get before a request renews it. Writing on every
 * request would turn a scroll through the grid into a stream of database
 * writes for no benefit.
 */
const RENEW_AFTER_HOURS = 12;

const insertSession = db.prepare(
  `INSERT INTO sessions (token_hash, user_id, expires_at, user_agent)
   VALUES (@tokenHash, @userId, @expiresAt, @userAgent)`,
);

const selectSession = db.prepare(
  `SELECT token_hash AS tokenHash, user_id AS userId, expires_at AS expiresAt,
          last_seen_at AS lastSeenAt
     FROM sessions
    WHERE token_hash = ?`,
);

const touchSession = db.prepare(
  `UPDATE sessions
      SET last_seen_at = datetime('now'), expires_at = @expiresAt
    WHERE token_hash = @tokenHash`,
);

const deleteSession = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
const deleteExpired = db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')");

function expiryFrom(now: Date): string {
  const at = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  return at.toISOString().replace('T', ' ').slice(0, 19);
}

export interface StartedSession {
  /** The value for the cookie. The database only ever sees its hash. */
  token: string;
  maxAgeSeconds: number;
}

export function startSession(userId: number, userAgent: string): StartedSession {
  const token = createSessionToken();
  insertSession.run({
    tokenHash: hashSessionToken(token),
    userId,
    expiresAt: expiryFrom(new Date()),
    userAgent: userAgent.slice(0, 200),
  });
  return { token, maxAgeSeconds: SESSION_DAYS * 24 * 60 * 60 };
}

/**
 * Resolves a cookie to an account, renewing a session that is being used. An
 * expired row is deleted on the way past rather than left to the sweeper.
 */
export function resolveSession(token: string | null): UserRow | null {
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const row = selectSession.get(tokenHash) as
    | { tokenHash: string; userId: number; expiresAt: string; lastSeenAt: string }
    | undefined;
  if (!row) return null;

  const now = new Date();
  const expiresAt = Date.parse(`${row.expiresAt.replace(' ', 'T')}Z`);
  if (Number.isFinite(expiresAt) && expiresAt <= now.getTime()) {
    deleteSession.run(tokenHash);
    return null;
  }

  const user = findUserById(row.userId);
  if (!user || user.password_hash === null) {
    deleteSession.run(tokenHash);
    return null;
  }

  const lastSeen = Date.parse(`${row.lastSeenAt.replace(' ', 'T')}Z`);
  if (!Number.isFinite(lastSeen) || now.getTime() - lastSeen > RENEW_AFTER_HOURS * 60 * 60 * 1000) {
    touchSession.run({ tokenHash, expiresAt: expiryFrom(now) });
  }

  return user;
}

export function endSession(token: string | null): void {
  if (!token) return;
  deleteSession.run(hashSessionToken(token));
}

/** Used after a password change, so a session someone else holds stops working. */
export function endAllSessionsFor(userId: number, exceptToken?: string | null): number {
  const keep = exceptToken ? hashSessionToken(exceptToken) : '';
  return db
    .prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?')
    .run(userId, keep).changes;
}

export function sweepExpiredSessions(): number {
  return deleteExpired.run().changes;
}
