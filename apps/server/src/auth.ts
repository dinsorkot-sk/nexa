import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { PlatformDatabase } from '@nexa/core/db';
import type { User } from '@nexa/types';

const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const computed = scryptSync(password, salt, KEYLEN);
  const storedBuf = Buffer.from(hash, 'hex');
  if (computed.length !== storedBuf.length) return false;
  return timingSafeEqual(computed, storedBuf);
}

export async function registerUser(db: Kysely<PlatformDatabase>, email: string, password: string, name: string | null): Promise<User> {
  const id = randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password);
  const now = new Date().toISOString();
  await db.insertInto('users').values({
    id,
    email,
    name,
    password_hash: passwordHash,
  }).execute();
  return { id, email, name, passwordHash, createdAt: now };
}

export async function loginUser(db: Kysely<PlatformDatabase>, email: string, password: string): Promise<{ user: User; token: string } | null> {
  const row = await db.selectFrom('users').selectAll().where('email', '=', email).executeTakeFirst();
  if (!row) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  await db.insertInto('sessions').values({
    id: randomBytes(16).toString('hex'),
    user_id: row.id,
    token,
    expires_at: expires,
  }).execute();
  const user: User = {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
  return { user, token };
}
