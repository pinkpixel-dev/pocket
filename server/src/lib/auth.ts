import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * scrypt from Node's own crypto, rather than a native bcrypt or argon2 binding.
 * Pocket already asks a NAS to compile `better-sqlite3`; a second compiled
 * dependency for one hash is not a trade worth making, and scrypt at these
 * parameters is a memory-hard function in its own right.
 */
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

/** Stored as `scrypt$<salt hex>$<hash hex>`, so parameters can change later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/**
 * Always does the full derivation, even for a malformed stored hash, so the
 * time a wrong password takes says nothing about whether the account exists.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const [scheme, saltHex, hashHex] = (stored ?? '').split('$');
  const usable = scheme === 'scrypt' && !!saltHex && !!hashHex;

  const salt = usable ? Buffer.from(saltHex, 'hex') : randomBytes(SALT_BYTES);
  const expected = usable ? Buffer.from(hashHex, 'hex') : randomBytes(KEY_LENGTH);

  const derived = await scryptAsync(password.normalize('NFKC'), salt, expected.length || KEY_LENGTH);
  if (!usable) return false;
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/** The value that goes in the cookie. Never stored anywhere. */
export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * What the database holds instead of the token. A stolen backup then cannot be
 * turned into a live session, the same reason the password is not stored either.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface PasswordProblem {
  message: string;
}

const MIN_PASSWORD_LENGTH = 8;

/**
 * Length is the only rule. Composition rules push people towards `Passw0rd!`
 * and Pocket sits on a home network, so a long passphrase is the thing worth
 * asking for.
 */
export function checkPassword(password: string): PasswordProblem | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { message: `A password needs at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password.length > 200) {
    return { message: 'That password is longer than 200 characters.' };
  }
  return null;
}

/** Usernames go in URLs and greetings, so they stay boring on purpose. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function checkUsername(username: string): PasswordProblem | null {
  if (username.length < 2) return { message: 'A username needs at least two characters.' };
  if (username.length > 32) return { message: 'A username can be at most 32 characters.' };
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(username)) {
    return {
      message: 'A username can use letters, numbers, dots, dashes and underscores, and must start with a letter or number.',
    };
  }
  return null;
}
