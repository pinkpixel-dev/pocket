import { db } from '../db/index.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { checkPassword, checkUsername, hashPassword, normalizeUsername } from '../lib/auth.js';
import { deleteBookmarks } from './bookmarks.js';
import { forgetAuditState } from './audit.js';

export interface UserRow {
  id: number;
  username: string;
  display_name: string;
  password_hash: string | null;
  is_owner: number;
  created_at: string;
  updated_at: string;
}

/** What the browser is allowed to know about an account. */
export interface PublicUser {
  id: number;
  username: string;
  displayName: string;
  isOwner: boolean;
  createdAt: string;
  bookmarkCount: number;
}

const countBookmarksFor = db.prepare('SELECT COUNT(*) AS count FROM bookmarks WHERE user_id = ?');

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    isOwner: row.is_owner === 1,
    createdAt: row.created_at,
    bookmarkCount: (countBookmarksFor.get(row.id) as { count: number }).count,
  };
}

const selectById = db.prepare('SELECT * FROM users WHERE id = ?');
const selectByUsername = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE');

export function findUserById(id: number): UserRow | undefined {
  return selectById.get(id) as UserRow | undefined;
}

export function findUserByUsername(username: string): UserRow | undefined {
  return selectByUsername.get(normalizeUsername(username)) as UserRow | undefined;
}

/**
 * The owner row exists from the first migration onwards, but without a password
 * until someone claims it. That is what "Pocket has not been set up" means, and
 * it is also what hands a library saved before accounts existed to whoever
 * finishes setup rather than stranding it.
 */
export function pendingOwner(): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE is_owner = 1 AND password_hash IS NULL').get() as
    | UserRow
    | undefined;
}

export function needsSetup(): boolean {
  return pendingOwner() !== undefined;
}

export function listUsers(): PublicUser[] {
  const rows = db
    .prepare('SELECT * FROM users WHERE password_hash IS NOT NULL ORDER BY is_owner DESC, username ASC')
    .all() as UserRow[];
  return rows.map(toPublicUser);
}

function validate(username: string, password: string): string {
  const name = normalizeUsername(username);
  const nameProblem = checkUsername(name);
  if (nameProblem) throw badRequest(nameProblem.message);

  const passwordProblem = checkPassword(password);
  if (passwordProblem) throw badRequest(passwordProblem.message);

  return name;
}

export interface NewUserInput {
  username: string;
  password: string;
  displayName?: string;
}

/**
 * Finishes first-run setup by claiming the placeholder owner. Everything the
 * library already holds belongs to that row, so this is a rename and a password
 * rather than an insert.
 */
export async function claimOwner(input: NewUserInput): Promise<PublicUser> {
  const pending = pendingOwner();
  if (!pending) throw badRequest('Pocket has already been set up. Sign in instead.');

  const username = validate(input.username, input.password);
  const clash = findUserByUsername(username);
  if (clash && clash.id !== pending.id) throw conflict('That username is taken.');

  const passwordHash = await hashPassword(input.password);

  db.prepare(
    `UPDATE users
        SET username = ?, display_name = ?, password_hash = ?, updated_at = datetime('now')
      WHERE id = ?`,
  ).run(username, input.displayName?.trim().slice(0, 60) ?? '', passwordHash, pending.id);

  return toPublicUser(findUserById(pending.id)!);
}

/** Only the owner can reach this. Pocket has no open sign-up. */
export async function createUser(input: NewUserInput): Promise<PublicUser> {
  const username = validate(input.username, input.password);
  if (findUserByUsername(username)) throw conflict('That username is taken.');

  const passwordHash = await hashPassword(input.password);
  const result = db
    .prepare('INSERT INTO users (username, display_name, password_hash, is_owner) VALUES (?, ?, ?, 0)')
    .run(username, input.displayName?.trim().slice(0, 60) ?? '', passwordHash);

  return toPublicUser(findUserById(Number(result.lastInsertRowid))!);
}

export async function setPassword(userId: number, password: string): Promise<void> {
  const problem = checkPassword(password);
  if (problem) throw badRequest(problem.message);

  const passwordHash = await hashPassword(password);
  const result = db
    .prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
    .run(passwordHash, userId);
  if (result.changes === 0) throw notFound('That account no longer exists.');
}

export function setDisplayName(userId: number, displayName: string): PublicUser {
  db.prepare("UPDATE users SET display_name = ?, updated_at = datetime('now') WHERE id = ?").run(
    displayName.trim().slice(0, 60),
    userId,
  );
  const row = findUserById(userId);
  if (!row) throw notFound('That account no longer exists.');
  return toPublicUser(row);
}

/**
 * Removes an account and the library behind it. The bookmarks go through the
 * normal delete first, because that is the only path that also releases the
 * cached preview files. A foreign key cascade would leave those on disk forever.
 */
export async function deleteUser(userId: number): Promise<void> {
  const row = findUserById(userId);
  if (!row) throw notFound('That account no longer exists.');
  if (row.is_owner === 1) throw badRequest('The owner account cannot be deleted.');

  const ids = (
    db.prepare('SELECT id FROM bookmarks WHERE user_id = ?').all(userId) as Array<{ id: number }>
  ).map((item) => item.id);

  // In chunks, so a library of thousands does not build one enormous statement.
  for (let index = 0; index < ids.length; index += 500) {
    await deleteBookmarks(userId, ids.slice(index, index + 500));
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  forgetAuditState(userId);
}
