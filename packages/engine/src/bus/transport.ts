import type { SqlDriver } from '../contracts/index.js';

/**
 * Transport of bus envelopes between the publishing transaction and the subscribers.
 *
 * Contract: `send` is issued THROUGH the publishing driver, inside whatever transaction is active, and
 * the transport must only deliver it once that transaction commits (dropped on rollback, including
 * rollback to a savepoint taken before the send). `listen` registers a callback for envelopes of one
 * tenant database and returns an unsubscribe function.
 */
export interface BusTransport {
  send(driver: SqlDriver, envelope: string): Promise<void>;
  listen(driver: SqlDriver, onEnvelope: (envelope: string) => void): Promise<() => Promise<void>>;
}

/** Postgres NOTIFY channel used inside each tenant database. */
export const BUS_CHANNEL = 'nx_bus';
/** Postgres rejects NOTIFY payloads of 8000 bytes or more; keep a margin. */
export const MAX_ENVELOPE_BYTES = 7_900;

interface Listenable {
  listen(channel: string, cb: (payload: string) => void): Promise<() => Promise<void>>;
}

/**
 * The PGlite instance behind a PgliteDriver. The driver keeps it private; this structural probe is the
 * single place that reaches into it (follow-up: expose `PgliteDriver.listen()` instead).
 */
function listenable(driver: SqlDriver): Listenable | undefined {
  const db = (driver as unknown as { db?: unknown }).db as Partial<Listenable> | undefined;
  return db && typeof db.listen === 'function' ? db as Listenable : undefined;
}

/**
 * LISTEN/NOTIFY transport. `pg_notify` is transactional in Postgres and in PGlite (verified: delivered
 * on commit, dropped on rollback and on ROLLBACK TO SAVEPOINT), so the commit buffering comes from the
 * database itself and also works across processes on a real Postgres server, where `listen` would use
 * a dedicated connection instead of the in-process PGlite handle.
 */
export class PgNotifyTransport implements BusTransport {
  async send(driver: SqlDriver, envelope: string): Promise<void> {
    if (Buffer.byteLength(envelope, 'utf8') > MAX_ENVELOPE_BYTES) throw new Error('Bus envelope is too large');
    await driver.query({ text: 'SELECT pg_notify($1, $2)', params: [BUS_CHANNEL, envelope] });
  }

  async listen(driver: SqlDriver, onEnvelope: (envelope: string) => void): Promise<() => Promise<void>> {
    const db = listenable(driver);
    if (!db) throw new Error('This database driver cannot LISTEN');
    return db.listen(BUS_CHANNEL, onEnvelope);
  }
}

let transport: BusTransport = new PgNotifyTransport();
export function busTransport(): BusTransport { return transport; }
/** Replace the transport (e.g. a dedicated-connection Postgres listener). Affects hubs created afterwards. */
export function setBusTransport(next: BusTransport): void { transport = next; }
