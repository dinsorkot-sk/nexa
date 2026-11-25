import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AccessError, ModuleCatalog, PgliteTenantManager, ValidationError, baseModule, type Env, type TenantHandle } from '../src/index.js';
import { MailQueueService, enqueueOutgoingMail, type MailDelivery, type MailTransport } from '../src/mail/outgoing.js';
import { mailModule } from '../src/mail/manifest.js';

let manager: PgliteTenantManager;
let handle: TenantHandle;
let root: Env;
let user: Env;
let messageId: number;

async function createMail(): Promise<number> {
  const [subtype] = await handle.driver.query<{ res_id: number }>({
    text: `SELECT res_id FROM nx_model_data WHERE module = 'mail' AND name = 'mt_comment'`, params: [],
  });
  const record = await root.model('mail.message').create({
    model: 'res.partner', res_id: 1, body: '<p>Queued</p>', message_type: 'email', subtype_id: subtype!.res_id, date: new Date(),
  });
  return record.ids[0]!;
}

async function queue(input: Partial<Parameters<typeof enqueueOutgoingMail>[1]> = {}) {
  return enqueueOutgoingMail(root, {
    messageId,
    recipients: ['alice@example.test'],
    subject: 'Hello',
    bodyHtml: '<p>Hello</p>',
    ...input,
  });
}

beforeAll(async () => {
  manager = new PgliteTenantManager({ catalog: new ModuleCatalog([baseModule, mailModule]) });
  handle = await manager.create('mail-queue', ['mail']);
  root = handle.env({ uid: 1 });
  const [company] = (await root.model('res.company').search([], { limit: 1 })).ids;
  const [group] = (await root.model('res.groups').search([['code', '=', 'base.group_user']])).ids;
  const [uid] = (await root.model('res.users').create({ name: 'Mail user', login: 'mail-user', company_id: company, group_ids: [group] })).ids;
  user = handle.env({ uid: uid! });
  messageId = await createMail();
}, 120_000);

afterAll(async () => { await manager.closeAll(); });

describe('outgoing mail queue', () => {
  it('persists one idempotent row per recipient and delivers recipients separately', async () => {
    const ids = await queue({ recipients: ['Alice@EXAMPLE.test', 'Alice@example.test', 'bob@example.test'] });
    expect(ids).toHaveLength(2);
    const before = await handle.driver.query<{ state: string; recipient: string }>({
      text: `SELECT state, recipient FROM nx_mail_outgoing WHERE id = ANY($1::bigint[]) ORDER BY recipient`, params: [ids],
    });
    expect(before).toEqual([
      expect.objectContaining({ state: 'pending', recipient: 'Alice@example.test' }),
      expect.objectContaining({ state: 'pending', recipient: 'bob@example.test' }),
    ]);
    const repeat = await queue({ recipients: ['bob@example.test', 'Alice@example.test'] });
    expect(new Set(repeat)).toEqual(new Set(ids));

    const deliveries: MailDelivery[] = [];
    const service = new MailQueueService(root, { deliver: async (mail) => { deliveries.push(mail); } });
    await expect(service.process(21)).rejects.toThrow(ValidationError);
    expect(await service.process()).toEqual({ sent: 2, deferred: 0, failed: 0 });
    expect(deliveries).toHaveLength(2);
    expect(deliveries.map(({ recipients }) => recipients[0]).sort()).toEqual(['Alice@example.test', 'bob@example.test']);
    expect(deliveries.every(({ messageId: value }) => /^<[^<>]+@nexa\.local>$/.test(value))).toBe(true);
    const after = await handle.driver.query<{ state: string; attempts: number }>({
      text: `SELECT state, attempts FROM nx_mail_outgoing WHERE id = ANY($1::bigint[])`, params: [ids],
    });
    expect(after).toHaveLength(2);
    expect(after.every((row) => row.state === 'sent' && row.attempts === 1)).toBe(true);
  });

  it('retries with bounded attempts, then records a generic terminal failure', async () => {
    const [id] = await queue({ recipients: ['retry@example.test'] });
    const transport: MailTransport = { deliver: vi.fn(async () => { throw new Error('secret SMTP server detail'); }) };
    const service = new MailQueueService(root, transport);
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt > 0) await handle.driver.query({
        text: `UPDATE nx_mail_outgoing SET next_attempt_at = now() WHERE id = $1`, params: [id],
      });
      const result = await service.process(1);
      expect(result).toEqual(attempt === 4
        ? { sent: 0, deferred: 0, failed: 1 }
        : { sent: 0, deferred: 1, failed: 0 });
    }
    expect(transport.deliver).toHaveBeenCalledTimes(5);
    const [row] = await handle.driver.query<{ state: string; attempts: number; last_error: string; lease_token: string | null }>({
      text: `SELECT state, attempts, last_error, lease_token FROM nx_mail_outgoing WHERE id = $1`, params: [id],
    });
    expect(row).toEqual(expect.objectContaining({ state: 'failed', attempts: 5, last_error: 'delivery_failed', lease_token: null }));
    expect((await service.process(1)).failed).toBe(0);
  });

  it('claims atomically and skips jobs already being delivered', async () => {
    await queue({ recipients: ['once-a@example.test', 'once-b@example.test'] });
    let releaseDelivery!: () => void;
    let bothDeliveriesStarted!: () => void;
    const started = new Promise<void>((resolve) => { bothDeliveriesStarted = resolve; });
    const blocked = new Promise<void>((resolve) => { releaseDelivery = resolve; });
    const recipients: string[] = [];
    const transport: MailTransport = { deliver: async (mail) => {
      recipients.push(mail.recipients[0]!);
      if (recipients.length === 2) bothDeliveriesStarted();
      await blocked;
    } };
    const service = new MailQueueService(root, transport);
    const runs = [service.process(1), service.process(1)];
    await started;
    expect(recipients.sort()).toEqual(['once-a@example.test', 'once-b@example.test']);
    releaseDelivery();
    expect(await Promise.all(runs)).toEqual([
      { sent: 1, deferred: 0, failed: 0 }, { sent: 1, deferred: 0, failed: 0 },
    ]);
  });

  it('marks a lease that ran out after the final attempt as failed', async () => {
    const [id] = await queue({ recipients: ['recovery@example.test'] });
    await handle.driver.query({
      text: `UPDATE nx_mail_outgoing SET state = 'sending', attempts = 5, lease_until = now() - interval '1 second' WHERE id = $1`, params: [id],
    });
    const result = await new MailQueueService(root, { deliver: async () => undefined }).process(1);
    expect(result).toEqual({ sent: 0, deferred: 0, failed: 1 });
    const [row] = await handle.driver.query<{ state: string; attempts: number }>({
      text: `SELECT state, attempts FROM nx_mail_outgoing WHERE id = $1`, params: [id],
    });
    expect(row).toEqual({ state: 'failed', attempts: 5 });
  });

  it('requires a system user and refuses processing inside a caller transaction', async () => {
    await queue({ recipients: ['restricted@example.test'] });
    const noDelivery: MailTransport = { deliver: async () => undefined };
    await expect(new MailQueueService(user, noDelivery).process(1)).rejects.toThrow(AccessError);
    await expect(root.transaction(() => new MailQueueService(root, noDelivery).process(1))).rejects.toThrow(ValidationError);
  });

  it('does not cache table creation across a rolled back outer transaction', async () => {
    const nextMessage = await createMail();
    await expect(root.transaction(async (tx) => {
      await enqueueOutgoingMail(tx, { messageId: nextMessage, recipients: ['rollback@example.test'], subject: '', bodyHtml: '' });
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    const rows = await handle.driver.query<{ id: number }>({
      text: `SELECT id FROM nx_mail_outgoing WHERE message_id = $1`, params: [nextMessage],
    });
    expect(rows).toHaveLength(0);
  });
});
