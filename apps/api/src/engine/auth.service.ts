import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { AccessError, SUPERUSER_ID, userSecurity, ValidationError, type TenantHandle } from '@nexa/engine';
import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { EngineService } from './engine.service';

const PASSWORD_BYTES = 64;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 1024;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const API_KEY_MAX_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const DUMMY_SALT = Buffer.from('7d3bce1d9bd4ab57ed3128a64676e570', 'hex');

export interface AuthenticatedToken {
  tenant: string;
  uid: number;
  tokenId: number;
  tokenHash: string;
  kind: 'session' | 'api_key';
}

export interface IssuedToken {
  id: number;
  name: string;
  token: string;
  expiresAt: string;
}

interface TokenRow {
  id: number;
  user_id: number;
  kind: 'session' | 'api_key';
  name: string;
  expires_at: string;
  revoked_at: string | null;
}

@Injectable()
export class AuthService {
  private readonly loginAttempts = new Map<string, { startedAt: number; count: number }>();
  private readonly maxConcurrentHashes = 4;
  private activeHashes = 0;
  private readonly initializedTenants = new Map<string, Promise<void>>();

  constructor(@Inject(EngineService) private readonly engine: EngineService) {}

  async provisionPassword(tenant: string, login: string, password: string): Promise<void> {
    this.validatePassword(password);
    const handle = await this.engine.tenant(tenant);
    const uid = await this.findActiveUser(handle, login);
    if (uid === null) throw new AccessError('User was not found or is inactive');
    await this.storePassword(handle, uid, password);
  }

  /** A signed-in user replaces their own password. Every session and API key of the user is revoked. */
  async changePassword(token: AuthenticatedToken, currentPassword: string, newPassword: string, clientKey: string): Promise<void> {
    if (token.kind !== 'session') throw new UnauthorizedException('A login session is required');
    const accountKey = 'password:' + token.tenant + ':' + token.uid;
    this.checkLoginRate('ip:' + clientKey, 30);
    this.checkLoginRate(accountKey, 5);
    this.checkPasswordPolicy(newPassword);
    const handle = await this.engine.tenant(token.tenant);
    const credential = await this.verifyPassword(handle, token.uid, currentPassword);
    // 403, not 401: a mistyped current password must not end the caller's session in the client
    if (!credential) throw new AccessError('Current password is incorrect');
    await this.storePassword(handle, token.uid, newPassword, credential);
    this.clearLoginAttempts(accountKey);
  }

  /**
   * A Settings administrator sets the initial password of another user, or resets it.
   * Every session and API key of the target user is revoked.
   */
  async setUserPassword(token: AuthenticatedToken, targetUid: number, newPassword: string): Promise<void> {
    if (token.kind !== 'session') throw new UnauthorizedException('A login session is required');
    const env = await this.engine.env(token.tenant, token.uid);
    if (!(await userSecurity(env as Parameters<typeof userSecurity>[0])).groups.has('base.group_system')) {
      throw new AccessError('Only Settings administrators can set user passwords');
    }
    if (targetUid === token.uid) throw new AccessError('Change your own password with your current password');
    this.checkPasswordPolicy(newPassword);
    const handle = await this.engine.tenant(token.tenant);
    if (targetUid <= SUPERUSER_ID) throw new NotFoundException('User was not found or is inactive');
    const [user] = await handle.driver.query<{ active: boolean }>({ text: 'SELECT active FROM res_users WHERE id = $1', params: [targetUid] });
    if (!user?.active) throw new NotFoundException('User was not found or is inactive');
    await this.storePassword(handle, targetUid, newPassword);
  }

  private async storePassword(
    handle: TenantHandle,
    uid: number,
    password: string,
    expectedCredential?: { salt: string; passwordHash: string },
  ): Promise<void> {
    const salt = randomBytes(16);
    const hash = await this.hashPassword(password, salt);
    await this.ensureTables(handle);
    const transactionalDriver = handle.driver as typeof handle.driver & {
      transaction<T>(fn: (tx: typeof handle.driver) => Promise<T>): Promise<T>;
    };
    await transactionalDriver.transaction(async (tx) => {
      const [user] = await tx.query<{ active: boolean }>({ text: 'SELECT active FROM res_users WHERE id = $1 FOR UPDATE', params: [uid] });
      if (!user?.active) throw new AccessError('User was not found or is inactive');
      if (expectedCredential) {
        const [current] = await tx.query<{ salt: string; password_hash: string }>({
          text: 'SELECT salt, password_hash FROM nx_auth_password WHERE user_id = $1',
          params: [uid],
        });
        if (!current || current.salt !== expectedCredential.salt || current.password_hash !== expectedCredential.passwordHash) {
          throw new UnauthorizedException('Credentials changed. Sign in again.');
        }
      }
      await tx.query({
        text: 'INSERT INTO nx_auth_password (user_id, salt, password_hash, updated_at) VALUES ($1, $2, $3, now()) ON CONFLICT (user_id) DO UPDATE SET salt = EXCLUDED.salt, password_hash = EXCLUDED.password_hash, updated_at = now()',
        params: [uid, salt.toString('hex'), hash.toString('hex')],
      });
      await tx.query({ text: 'DELETE FROM nx_auth_token WHERE user_id = $1', params: [uid] });
    });
  }

  async login(tenant: string, login: string, password: string, clientKey: string): Promise<IssuedToken> {
    const accountKey = 'login:' + tenant + ':' + login.toLowerCase();
    this.checkLoginRate('ip:' + clientKey, 30);
    this.checkLoginRate(accountKey, 5);
    if (!this.engine.config.tenants.has(tenant)) {
      await this.hashPassword(password, DUMMY_SALT);
      throw new UnauthorizedException('Invalid login or password');
    }
    const handle = await this.engine.tenant(tenant);
    await this.ensureTables(handle);
    const uid = await this.findActiveUser(handle, login);
    const [credential] = uid === null ? [] : await handle.driver.query<{ salt: string; password_hash: string }>({
      text: 'SELECT salt, password_hash FROM nx_auth_password WHERE user_id = $1',
      params: [uid],
    });
    if (!credential) {
      await this.hashPassword(password, DUMMY_SALT);
      throw new UnauthorizedException('Invalid login or password');
    }
    const supplied = await this.hashPassword(password, Buffer.from(credential.salt, 'hex'));
    const expected = Buffer.from(credential.password_hash, 'hex');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      throw new UnauthorizedException('Invalid login or password');
    }
    const issued = await this.createToken(
      handle, tenant, uid!, 'session', 'Login session', SESSION_TTL_MS,
      { salt: credential.salt, passwordHash: credential.password_hash },
    );
    this.clearLoginAttempts(accountKey);
    return issued;
  }

  async authenticate(token: string): Promise<AuthenticatedToken> {
    const match = /^nx1\.([a-z0-9][a-z0-9_-]{0,62})\.([A-Za-z0-9_-]{43})$/.exec(token);
    if (!match) throw new UnauthorizedException('Invalid bearer token');
    const tenantHint = match[1]!;
    if (!this.engine.config.tenants.has(tenantHint)) throw new UnauthorizedException('Invalid bearer token');
    const handle = await this.engine.tenant(tenantHint);
    await this.ensureTables(handle);
    const tokenHash = this.tokenHash(token);
    const [row] = await handle.driver.query<TokenRow>({
      text: 'SELECT id, user_id, kind, name, expires_at, revoked_at FROM nx_auth_token WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()',
      params: [tokenHash],
    });
    if (!row || row.user_id <= SUPERUSER_ID) throw new UnauthorizedException('Invalid bearer token');
    try {
      await this.engine.env(tenantHint, row.user_id);
    } catch (error) {
      if (!(error instanceof AccessError)) throw error;
      await handle.driver.query({ text: 'UPDATE nx_auth_token SET revoked_at = now() WHERE id = $1', params: [row.id] });
      throw new UnauthorizedException('Invalid bearer token');
    }
    await handle.driver.query({ text: 'UPDATE nx_auth_token SET last_used_at = now() WHERE id = $1', params: [row.id] });
    return { tenant: tenantHint, uid: row.user_id, tokenId: row.id, tokenHash, kind: row.kind };
  }

  async logout(token: AuthenticatedToken): Promise<void> {
    if (token.kind !== 'session') throw new UnauthorizedException('Only a login session can be logged out');
    const handle = await this.engine.tenant(token.tenant);
    await handle.driver.query({
      text: 'UPDATE nx_auth_token SET revoked_at = now() WHERE id = $1 AND token_hash = $2 AND kind = $3',
      params: [token.tokenId, token.tokenHash, token.kind],
    });
  }

  async createApiKey(
    token: AuthenticatedToken,
    password: string,
    name: string,
    clientKey: string,
    expiresInDays?: number,
  ): Promise<IssuedToken> {
    if (token.kind !== 'session') throw new UnauthorizedException('A login session is required');
    const accountKey = 'key:' + token.tenant + ':' + token.uid;
    this.checkLoginRate('ip:' + clientKey, 30);
    this.checkLoginRate(accountKey, 5);
    const handle = await this.engine.tenant(token.tenant);
    const credential = await this.verifyPassword(handle, token.uid, password);
    if (!credential) throw new UnauthorizedException('Invalid password');
    const ttl = expiresInDays === undefined ? API_KEY_MAX_TTL_MS : expiresInDays * 24 * 60 * 60 * 1000;
    const issued = await this.createToken(handle, token.tenant, token.uid, 'api_key', name, ttl, credential, token);
    this.clearLoginAttempts(accountKey);
    return issued;
  }

  async revokeApiKey(token: AuthenticatedToken, keyId: number): Promise<void> {
    if (token.kind !== 'session') throw new UnauthorizedException('A login session is required');
    const handle = await this.engine.tenant(token.tenant);
    const result = await handle.driver.query({
      text: 'UPDATE nx_auth_token SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND kind = \'api_key\' AND revoked_at IS NULL',
      params: [keyId, token.uid],
    });
    if (!result.length) {
      const [row] = await handle.driver.query<{ id: number }>({
        text: 'SELECT id FROM nx_auth_token WHERE id = $1 AND user_id = $2 AND kind = \'api_key\'',
        params: [keyId, token.uid],
      });
      if (!row) throw new NotFoundException('API key was not found');
    }
  }

  validateApiKeyRequest(name: string, expiresInDays?: number): void {
    if (!name.trim() || name.length > 80) throw new UnauthorizedException('API key name must be between 1 and 80 characters');
    if (expiresInDays !== undefined && (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365)) {
      throw new UnauthorizedException('API key expiry must be between 1 and 365 days');
    }
  }

  private async verifyPassword(
    handle: TenantHandle,
    uid: number,
    password: string,
  ): Promise<{ salt: string; passwordHash: string } | null> {
    if (password.length > PASSWORD_MAX_LENGTH) return null;
    await this.ensureTables(handle);
    const [credential] = await handle.driver.query<{ salt: string; password_hash: string }>({
      text: 'SELECT salt, password_hash FROM nx_auth_password WHERE user_id = $1',
      params: [uid],
    });
    if (!credential) {
      await this.hashPassword(password, DUMMY_SALT);
      return null;
    }
    const supplied = await this.hashPassword(password, Buffer.from(credential.salt, 'hex'));
    const expected = Buffer.from(credential.password_hash, 'hex');
    return expected.length === supplied.length && timingSafeEqual(expected, supplied)
      ? { salt: credential.salt, passwordHash: credential.password_hash }
      : null;
  }

  private async findActiveUser(handle: TenantHandle, login: string): Promise<number | null> {
    if (!login || login.length > 120) return null;
    const rows = await handle.env({ uid: SUPERUSER_ID }).model('res.users').search([['login', '=', login]]);
    return rows.ids.length === 1 && rows.ids[0] !== SUPERUSER_ID ? rows.ids[0]! : null;
  }

  private async createToken(
    handle: TenantHandle,
    tenant: string,
    uid: number,
    kind: 'session' | 'api_key',
    name: string,
    ttlMs: number,
    expectedCredential?: { salt: string; passwordHash: string },
    expectedSession?: AuthenticatedToken,
  ): Promise<IssuedToken> {
    const expiresAt = new Date(Date.now() + ttlMs);
    const token = 'nx1.' + tenant + '.' + randomBytes(32).toString('base64url');
    const tokenHash = this.tokenHash(token);
    let id: number | undefined;
    const transactionalDriver = handle.driver as typeof handle.driver & {
      transaction<T>(fn: (tx: typeof handle.driver) => Promise<T>): Promise<T>;
    };
    await transactionalDriver.transaction(async (tx) => {
      const [user] = await tx.query<{ active: boolean }>({
        text: 'SELECT active FROM res_users WHERE id = $1',
        params: [uid],
      });
      if (!user?.active) throw new UnauthorizedException('User is inactive');
      if (expectedCredential) {
        const [current] = await tx.query<{ salt: string; password_hash: string }>({
          text: 'SELECT salt, password_hash FROM nx_auth_password WHERE user_id = $1',
          params: [uid],
        });
        if (!current || current.salt !== expectedCredential.salt || current.password_hash !== expectedCredential.passwordHash) {
          throw new UnauthorizedException('Credentials changed. Sign in again.');
        }
      }
      if (expectedSession) {
        const [session] = await tx.query<{ id: number }>({
          text: "SELECT id FROM nx_auth_token WHERE id = $1 AND user_id = $2 AND token_hash = $3 AND kind = 'session' AND revoked_at IS NULL AND expires_at > now()",
          params: [expectedSession.tokenId, uid, expectedSession.tokenHash],
        });
        if (!session) throw new UnauthorizedException('Login session expired. Sign in again.');
      }
      const [row] = await tx.query<{ id: number }>({
        text: 'INSERT INTO nx_auth_token (user_id, token_hash, kind, name, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        params: [uid, tokenHash, kind, name, expiresAt.toISOString()],
      });
      id = row!.id;
    });
    if (id === undefined) throw new Error('Could not create authentication token');
    return { id, name, token, expiresAt: expiresAt.toISOString() };
  }

  private async ensureTables(handle: TenantHandle): Promise<void> {
    const existing = this.initializedTenants.get(handle.tenant);
    if (existing) return existing;
    const initializing = this.createAuthTables(handle);
    this.initializedTenants.set(handle.tenant, initializing);
    try {
      await initializing;
    } catch (error) {
      this.initializedTenants.delete(handle.tenant);
      throw error;
    }
  }

  private async createAuthTables(handle: TenantHandle): Promise<void> {
    await handle.driver.query({
      text: 'CREATE TABLE IF NOT EXISTS nx_auth_password (user_id INTEGER PRIMARY KEY REFERENCES res_users(id) ON DELETE CASCADE, salt TEXT NOT NULL, password_hash TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())',
      params: [],
    });
    await handle.driver.query({
      text: 'CREATE TABLE IF NOT EXISTS nx_auth_token (id BIGSERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES res_users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, kind TEXT NOT NULL CHECK (kind IN (\'session\', \'api_key\')), name TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_used_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ)',
      params: [],
    });
    await handle.driver.query({
      text: 'CREATE INDEX IF NOT EXISTS nx_auth_token_user_idx ON nx_auth_token (user_id, kind, revoked_at)',
      params: [],
    });
    await handle.driver.query({
      text: "CREATE OR REPLACE FUNCTION nx_auth_revoke_user_tokens() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.active IS DISTINCT FROM NEW.active AND NEW.active IS NOT TRUE THEN UPDATE nx_auth_token SET revoked_at = now() WHERE user_id = NEW.id AND revoked_at IS NULL; END IF; RETURN NEW; END $$",
      params: [],
    });
    await handle.driver.query({ text: 'DROP TRIGGER IF EXISTS nx_auth_revoke_user_tokens_trigger ON res_users', params: [] });
    await handle.driver.query({
      text: 'CREATE TRIGGER nx_auth_revoke_user_tokens_trigger AFTER UPDATE OF active ON res_users FOR EACH ROW EXECUTE FUNCTION nx_auth_revoke_user_tokens()',
      params: [],
    });
  }

  private async hashPassword(password: string, salt: Buffer): Promise<Buffer> {
    if (this.activeHashes >= this.maxConcurrentHashes) throw new UnauthorizedException('Authentication is busy');
    this.activeHashes += 1;
    try {
      return await new Promise<Buffer>((resolve, reject) => {
        scryptCallback(password, salt, PASSWORD_BYTES, SCRYPT_OPTIONS, (error, derivedKey) => {
          if (error) reject(error);
          else resolve(derivedKey as Buffer);
        });
      });
    } finally {
      this.activeHashes -= 1;
    }
  }

  private validatePassword(password: string): void {
    if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      throw new UnauthorizedException('Password must be between ' + PASSWORD_MIN_LENGTH + ' and ' + PASSWORD_MAX_LENGTH + ' characters');
    }
  }

  /** Password policy for signed-in requests: a 422, so the client keeps its session. */
  private checkPasswordPolicy(password: string): void {
    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      throw new ValidationError('Password must be between ' + PASSWORD_MIN_LENGTH + ' and ' + PASSWORD_MAX_LENGTH + ' characters');
    }
  }

  private tokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private checkLoginRate(key: string, maximum: number): void {
    const now = Date.now();
    const current = this.loginAttempts.get(key);
    if (!current || now - current.startedAt >= 60_000) {
      if (!current && this.loginAttempts.size >= 10_000) {
        for (const [attemptKey, attempt] of this.loginAttempts) {
          if (now - attempt.startedAt >= 60_000) this.loginAttempts.delete(attemptKey);
        }
        if (this.loginAttempts.size >= 10_000) throw new UnauthorizedException('Invalid login or password');
      }
      this.loginAttempts.set(key, { startedAt: now, count: 1 });
      return;
    }
    if (current.count >= maximum) throw new UnauthorizedException('Invalid login or password');
    current.count += 1;
  }

  private clearLoginAttempts(key: string): void {
    this.loginAttempts.delete(key);
  }
}
