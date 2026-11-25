import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessError, ModuleCatalog, PgliteTenantManager, ValidationError, baseModule, type Env, type ModuleManifest, type TenantHandle } from '../src/index.js';
import { MailAliasService, mailModule } from '../src/mail/index.js';

const all = { read: true, write: true, create: true, unlink: true };

const inboundTestModule: ModuleManifest = {
  name: 'mail_inbound_test',
  version: '1.0.0',
  depends: ['mail'],
  models: [{
    name: 'x.inbound.ticket',
    origin: 'module',
    extends: ['mail.thread'],
    fields: { name: { type: 'char', required: true } },
  }],
  access: [
    { model: 'x.inbound.ticket', group: 'base.group_user', perms: all },
    { model: 'x.inbound.ticket', group: 'base.group_system', perms: all },
  ],
};

let manager: PgliteTenantManager;
let handle: TenantHandle;
let root: Env;
let member: Env;
let memberUid: number;
let ticketId: number;

beforeAll(async () => {
  manager = new PgliteTenantManager({ catalog: new ModuleCatalog([baseModule, mailModule, inboundTestModule]) });
  handle = await manager.create('mail-inbound', ['mail_inbound_test']);
  root = handle.env({ uid: 1 });
  const [company] = (await root.model('res.company').search([], { limit: 1 })).ids;
  const [group] = (await root.model('res.groups').search([['code', '=', 'base.group_user']])).ids;
  [memberUid] = (await root.model('res.users').create({
    name: 'Inbound Member',
    login: 'inbound-member',
    company_id: company,
    company_ids: [company],
    group_ids: [group],
  })).ids;
  member = handle.env({ uid: memberUid! });
  [ticketId] = (await root.model('x.inbound.ticket').create({ name: 'Inbound ticket' })).ids;
}, 120_000);

afterAll(() => manager.closeAll());

describe('inbound mail aliases', () => {
  it('routes to the exact existing thread and creates a sanitized internal note', async () => {
    const aliases = new MailAliasService(root);
    await aliases.define({ alias: 'Support+one@example.test', model: 'x.inbound.ticket', recordId: ticketId! });
    const input = {
      alias: 'support+one@example.test',
      messageId: '<delivery-1@example.test>',
      from: 'Customer <customer@example.test>',
      subject: 'Question',
      text: '<script>alert(1)</script>\nA & B',
    };
    const result = await aliases.route(input);
    expect(result.duplicate).toBe(false);
    const [message] = await root.model('mail.message').browse(result.id).read([
      'model', 'res_id', 'body', 'subject', 'message_type', 'subtype_id', 'author_id', 'partner_ids', 'attachment_ids',
    ]);
    expect(message).toMatchObject({
      model: 'x.inbound.ticket',
      res_id: ticketId,
      body: '<p>From: Customer &lt;customer@example.test&gt;</p><p>&lt;script&gt;alert(1)&lt;/script&gt;<br>A &amp; B</p>',
      subject: 'Inbound email: Question',
      message_type: 'email',
      author_id: null,
      partner_ids: [],
      attachment_ids: [],
    });
    const [subtype] = await root.model('mail.message.subtype').browse(message!.subtype_id as number).read(['internal']);
    expect(subtype!.internal).toBe(true);
  });

  it('deduplicates a stable message id atomically per exact alias', async () => {
    const aliases = new MailAliasService(root);
    await aliases.define({ alias: 'dedup@example.test', model: 'x.inbound.ticket', recordId: ticketId! });
    const input = {
      alias: 'dedup@example.test',
      messageId: '<same@example.test>',
      from: 'customer@example.test',
      text: 'hello',
    };
    const [first, second] = await Promise.all([aliases.route(input), aliases.route(input)]);
    expect(first!.duplicate).toBe(false);
    expect(second!.duplicate).toBe(true);
    expect(second!.id).toBe(first!.id);
    expect(await root.model('mail.message').searchCount([
      ['model', '=', 'x.inbound.ticket'], ['res_id', '=', ticketId], ['subject', '=', 'Inbound email'],
    ])).toBe(1);
  });

  it('requires Settings access and a writable mapped document', async () => {
    const regular = new MailAliasService(member!);
    await expect(regular.define({ alias: 'denied@example.test', model: 'x.inbound.ticket', recordId: ticketId! }))
      .rejects.toThrow(AccessError);
    await expect(regular.route({
      alias: 'denied@example.test', messageId: '<denied@example.test>', from: 'x@example.test', text: 'x',
    })).rejects.toThrow(AccessError);
    await expect(new MailAliasService(root).define({
      alias: 'missing@example.test', model: 'x.inbound.ticket', recordId: 2_000_000_000,
    })).rejects.toThrow(AccessError);
  });

  it('does not route partial aliases or models without the mail thread mixin', async () => {
    const aliases = new MailAliasService(root);
    await aliases.define({ alias: 'exact@example.test', model: 'x.inbound.ticket', recordId: ticketId! });
    await expect(aliases.route({
      alias: 'other@example.test', messageId: '<other@example.test>', from: 'x@example.test', text: 'x',
    })).rejects.toThrow(ValidationError);
    await expect(aliases.define({ alias: 'plain@example.test', model: 'res.partner', recordId: 1 }))
      .rejects.toThrow(ValidationError);
    await expect(aliases.define({ alias: 'bad..dots@example.test', model: 'x.inbound.ticket', recordId: ticketId! }))
      .rejects.toThrow(ValidationError);
  });

  it('rejects a mapping whose document creation fingerprint no longer matches', async () => {
    const aliases = new MailAliasService(root);
    await aliases.define({ alias: 'fingerprint@example.test', model: 'x.inbound.ticket', recordId: ticketId! });
    await handle.driver.query({
      text: "UPDATE nx_mail_alias SET record_created_at = '2000-01-01T00:00:00.000Z' WHERE alias = $1",
      params: ['fingerprint@example.test'],
    });
    await expect(aliases.route({
      alias: 'fingerprint@example.test',
      messageId: '<fingerprint@example.test>',
      from: 'x@example.test',
      text: 'x',
    })).rejects.toThrow(ValidationError);
  });

  it('removes routing and its receipts, and invalidates a target that is recreated at the same id', async () => {
    const aliases = new MailAliasService(root);
    await aliases.define({ alias: 'remove@example.test', model: 'x.inbound.ticket', recordId: ticketId! });
    const sent = await aliases.route({
      alias: 'remove@example.test', messageId: '<remove@example.test>', from: 'x@example.test', text: 'x',
    });
    expect(await aliases.remove('remove@example.test')).toBe(true);
    expect(await aliases.remove('remove@example.test')).toBe(false);
    await expect(aliases.route({
      alias: 'remove@example.test', messageId: '<remove@example.test>', from: 'x@example.test', text: 'x',
    })).rejects.toThrow(ValidationError);

    const [otherTicket] = (await root.model('x.inbound.ticket').create({ name: 'Other ticket' })).ids;
    await aliases.define({ alias: 'remove@example.test', model: 'x.inbound.ticket', recordId: otherTicket! });
    await expect(aliases.route({
      alias: 'remove@example.test', messageId: '<remove@example.test>', from: 'x@example.test', text: 'x',
    })).rejects.toThrow(ValidationError);

    await root.model('x.inbound.ticket').browse(ticketId!).unlink();
    const [replacement] = (await root.model('x.inbound.ticket').create({ name: 'Replacement' })).ids;
    expect(replacement).not.toBe(ticketId);
    await aliases.define({ alias: 'reused@example.test', model: 'x.inbound.ticket', recordId: replacement! });
    expect((await aliases.route({
      alias: 'reused@example.test', messageId: '<new@example.test>', from: 'x@example.test', text: 'x',
    })).id).not.toBe(sent.id);
  });
});
