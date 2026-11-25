import type { ListenableSqlDriver, SqlDriver } from '../contracts/index.js';

/**
 * Transport of bus envelopes between the publishing transaction and the subscribers.
 *
 * Contract: `send` is issued THROUGH the publishing driver, inside whatever transaction is active, and
 * the transport must only deliver it once that transaction commits (dropped on rollback, including
 * rollback to a savepoint taken before the send). `listen` registers a callback for envelopes of one
 * tenant database and returns an unsubscribe function; `onReset` (optional) is called when envelopes
 * may have been lost (e.g. the LISTEN connection was re-established), so subscribers must resynchronize.
 */
export interface BusTransport {
  send(driver: SqlDriver, envelope: string): Promise<void>;
  listen(driver: SqlDriver, onEnvelope: (envelope: string) => void, onReset?: () => void): Promise<() => Promise<void>>;
}

/** Postgres NOTIFY channel used inside each tenant database. */
export const BUS_CHANNEL = 'nx_bus';
/** Postgres rejects NOTIFY payloads of 8000 bytes or more; keep a margin. */
export const MAX_ENVELOPE_BYTES = 7_900;

/** Drivers that can LISTEN: PgliteDriver (in-process) and PgDriver (dedicated connection). */
function listenable(driver: SqlDriver): ListenableSqlDriver | undefined {
  return typeof (driver as Partial<ListenableSqlDriver>).listen === 'function' ? driver as ListenableSqlDriver : undefined;
}

/**
 * LISTEN/NOTIFY transport. `pg_notify` is transactional in Postgres and in PGlite (verified: delivered
 * on commit, dropped on rollback and on ROLLBACK TO SAVEPOINT), so the commit buffering comes from the
 * database itself. The NOTIFY goes through the publishing transaction's connection (the driver pins it),
 * and on a real server PgDriver.listen uses a dedicated, auto-reconnecting connection, so delivery also
 * works across connections and processes. Notifications sent while a listener reconnects are lost;
 * `onReset` reports each reconnect.
 */
export class PgNotifyTransport implements BusTransport {
  async send(driver: SqlDriver, envelope: string): Promise<void> {
    if (Buffer.byteLength(envelope, 'utf8') > MAX_ENVELOPE_BYTES) throw new Error('Bus envelope is too large');
    await driver.query({ text: 'SELECT pg_notify($1, $2)', params: [BUS_CHANNEL, envelope] });
  }

  async listen(driver: SqlDriver, onEnvelope: (envelope: string) => void, onReset?: () => void): Promise<() => Promise<void>> {
    const db = listenable(driver);
    if (!db) throw new Error('This database driver cannot LISTEN');
    return db.listen(BUS_CHANNEL, onEnvelope, onReset ? { onReconnect: onReset } : {});
  }
}

let transport: BusTransport = new PgNotifyTransport();
export function busTransport(): BusTransport { return transport; }
/** Replace the transport (e.g. a dedicated-connection Postgres listener). Affects hubs created afterwards. */
export function setBusTransport(next: BusTransport): void { transport = next; }
