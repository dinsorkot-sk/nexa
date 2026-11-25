import { createHash, randomBytes } from 'node:crypto';
import type { SqlDriver } from '@nexa/engine';

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_EXPIRY_DAYS = 30;

export interface IssuePortalToken {
  model: string;
  recordId: number;
  issuerUid: number;
  recordCreatedAt: string;
  fields: readonly string[];
  includeChatter: boolean;
  expiresInDays: number;
}

export interface PortalGrant {
  id: number;
  model: string;
  recordId: number;
  issuerUid: number;
  recordCreatedAt: string;
  fields: string[];
  includeChatter: boolean;
}

interface PortalTokenRow extends PortalGrant {
  expires_at: string | Date;
}

interface InsertedPortalToken {
  id: number;
  expires_at: string | Date;
}

/** Stores single-record portal grants inside the tenant database. */
export class PortalTokenStore {
  private static readonly initialized = new WeakMap<SqlDriver, Promise<void>>();

  constructor(private readonly db: SqlDriver) {}

  async issue(input: IssuePortalToken): Promise<{ id: number; secret: string; expiresAt: string }> {
    this.validateIssue(input);
    await this.ensureTable(true);
    const secret = randomBytes(TOKEN_BYTES).toString('base64url');
    const hash = this.hash(secret);
    const [row] = await this.db.query<InsertedPortalToken>({
      text: `INSERT INTO nx_portal_token
        (token_hash, model, record_id, issuer_uid, record_created_at, fields, include_chatter, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, now() + ($8::int * interval '1 day'))
        RETURNING id, expires_at`,
      params: [hash, input.model, input.recordId, input.issuerUid, input.recordCreatedAt,
        JSON.stringify(input.fields), input.includeChatter, input.expiresInDays],
    });
    if (!row) throw new Error('Portal token insert returned no row');
    return { id: row.id, secret, expiresAt: this.isoDate(row.expires_at) };
  }

  async find(secret: string): Promise<(PortalGrant & { expiresAt: string }) | null> {
    if (!this.isCanonicalSecret(secret)) return null;
    if (!await this.ensureTable(false)) return null;
    const [row] = await this.db.query<PortalTokenRow>({
      text: `SELECT id, model, record_id AS "recordId", issuer_uid AS "issuerUid",
          record_created_at AS "recordCreatedAt", fields, include_chatter AS "includeChatter", expires_at
        FROM nx_portal_token
        WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
      params: [this.hash(secret)],
    });
    if (!row) return null;
    const fields = typeof row.fields === 'string' ? JSON.parse(row.fields) as unknown : row.fields;
    if (!Array.isArray(fields) || !fields.every((field) => typeof field === 'string')) return null;
    return {
      id: row.id,
      model: row.model,
      recordId: row.recordId,
      issuerUid: row.issuerUid,
      recordCreatedAt: row.recordCreatedAt,
      fields,
      includeChatter: row.includeChatter,
      expiresAt: this.isoDate(row.expires_at),
    };
  }

  async revoke(id: number, issuerUid: number): Promise<boolean> {
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(issuerUid) || issuerUid <= 0) return false;
    if (!await this.ensureTable(false)) return false;
    const rows = await this.db.query<{ id: number }>({
      text: `UPDATE nx_portal_token SET revoked_at = now()
        WHERE id = $1 AND issuer_uid = $2 AND revoked_at IS NULL RETURNING id`,
      params: [id, issuerUid],
    });
    return rows.length > 0;
  }

  private async ensureTable(createIfMissing: boolean): Promise<boolean> {
    const known = PortalTokenStore.initialized.get(this.db);
    if (known) {
      await known;
      return true;
    }
    if (!createIfMissing) {
      const [row] = await this.db.query<{ exists: boolean }>({
        text: "SELECT to_regclass('nx_portal_token') IS NOT NULL AS exists",
        params: [],
      });
      if (!row?.exists) return false;
      PortalTokenStore.initialized.set(this.db, Promise.resolve());
      return true;
    }

    let initialization = PortalTokenStore.initialized.get(this.db);
    if (!initialization) {
      initialization = this.db.transaction(async (tx) => {
        await tx.query({
          text: `CREATE TABLE IF NOT EXISTS nx_portal_token (
            id SERIAL PRIMARY KEY,
            token_hash CHAR(64) NOT NULL UNIQUE,
            model TEXT NOT NULL,
            record_id INTEGER NOT NULL CHECK (record_id > 0),
            issuer_uid INTEGER NOT NULL CHECK (issuer_uid > 0),
            record_created_at TEXT NOT NULL,
            fields JSONB NOT NULL,
            include_chatter BOOLEAN NOT NULL DEFAULT FALSE,
            expires_at TIMESTAMPTZ NOT NULL,
            revoked_at TIMESTAMPTZ
          )`, params: [],
        });
      }).then(() => undefined);
      PortalTokenStore.initialized.set(this.db, initialization);
      initialization = initialization.catch((error: unknown) => {
        PortalTokenStore.initialized.delete(this.db);
        throw error;
      });
      PortalTokenStore.initialized.set(this.db, initialization);
    }
    await initialization;
    return true;
  }

  private validateIssue(input: IssuePortalToken): void {
    if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/.test(input.model) || input.model.length > 120) throw new TypeError('Invalid portal model');
    if (!Number.isSafeInteger(input.recordId) || input.recordId <= 0) throw new TypeError('Invalid portal record id');
    if (!Number.isSafeInteger(input.issuerUid) || input.issuerUid <= 0) throw new TypeError('Invalid portal issuer');
    if (typeof input.recordCreatedAt !== 'string' || !Number.isFinite(Date.parse(input.recordCreatedAt))) throw new TypeError('Invalid portal record creation timestamp');
    if (!Array.isArray(input.fields) || input.fields.length < 1 || input.fields.length > 25 ||
        !input.fields.every((field) => typeof field === 'string' && /^[a-z][a-z0-9_]*$/.test(field) && field.length <= 63)) throw new TypeError('Invalid portal fields');
    if (typeof input.includeChatter !== 'boolean') throw new TypeError('Invalid portal chatter option');
    if (!Number.isSafeInteger(input.expiresInDays) || input.expiresInDays < 1 || input.expiresInDays > MAX_EXPIRY_DAYS) throw new TypeError('Portal expiry must be between 1 and 30 days');
  }

  private isCanonicalSecret(secret: string): boolean {
    if (!TOKEN_PATTERN.test(secret)) return false;
    const decoded = Buffer.from(secret, 'base64url');
    return decoded.length === TOKEN_BYTES && decoded.toString('base64url') === secret;
  }

  private hash(secret: string): string {
    return createHash('sha256').update(secret, 'ascii').digest('hex');
  }

  private isoDate(value: string | Date): string {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error('Portal token database returned an invalid timestamp');
    return date.toISOString();
  }
}
