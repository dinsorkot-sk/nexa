import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessError, AuditService, AutomationRuleService, ModuleCatalog, PgliteTenantManager, ServerActionService, ValidationError, baseModule,
  type Env, type ModuleManifest, type TenantHandle,
} from '../src/index.js';
import {
  ActivityService, MailTemplateService, MailThreadService, TEMPLATE_LIMITS, mailModule, parseTemplate, sanitizeHtml, safeUrl,
} from '../src/mail/index.js';

const all = { read: true, write: true, create: true, unlink: true };

const testModule: ModuleManifest = {
  name: 'mail_test', version: '1.0.0', depends: ['mail'],
  models: [
    {
      name: 'x.ticket', origin: 'module', extends: ['mail.thread', 'mail.activity.mixin'],
      fields: {
        name: { type: 'char', tracking: true, string: 'Title' },
        state: { type: 'selection', selection: [['new', 'New'], ['done', 'Done']], default: 'new', tracking: true, string: 'Status' },
        partner_id: { type: 'many2one', comodel: 'res.partner', tracking: true, string: 'Customer' },
        amount: { type: 'float', tracking: true },
        priority: { type: 'integer', tracking: true },
        deadline: { type: 'date', tracking: true },
        note: { type: 'char' },
        secret: { type: 'char', tracking: true, groups: ['base.group_system'] },
        currency_id: { type: 'many2one', comodel: 'res.currency' },
        line_ids: { type: 'one2many', comodel: 'x.ticket.line', inverseName: 'ticket_id' },
      },
    },
    { name: 'x.ticket.line', origin: 'module', fields: { ticket_id: { type: 'many2one', comodel: 'x.ticket', ondelete: 'cascade' }, name: { type: 'char' }, qty: { type: 'integer' } } },
    { name: 'x.ticket.ref', origin: 'module', fields: { ticket_id: { type: 'many2one', comodel: 'x.ticket', ondelete: 'restrict' } } },
    { name: 'x.plain', origin: 'module', fields: { name: { type: 'char', tracking: true } } },
  ],
  access: [
    { model: 'x.ticket', group: 'base.group_user', perms: all },
    { model: 'x.ticket', group: 'base.group_portal', perms: { read: true, write: false, create: false, unlink: false } },
    { model: 'x.ticket.line', group: 'base.group_user', perms: all },
    { model: 'x.plain', group: 'base.group_user', perms: all },
    { model: 'x.ticket.ref', group: 'base.group_user', perms: all },
  ],
  rules: [{
    name: 'x_ticket_own_write', model: 'x.ticket', groups: ['base.group_user'],
    perms: { read: false, write: true, create: false, unlink: true }, domain: [['create_uid', '=', { $ctx: 'uid' } as never]],
  }],
};

let manager: PgliteTenantManager;
let h: TenantHandle;
let root: Env;
let alice: Env;
let bob: Env;
let aliceUid: number;
let bobUid: number;
let alicePartner: number;
let bobPartner: number;
let portal: Env;
let customer: number;

const ref = async (xmlId: string): Promise<number> => {
  const [mod, name] = xmlId.split('.');
  const [row] = await h.driver.query<{ res_id: number }>({ text: 'SELECT res_id FROM nx_model_data WHERE module = $1 AND name = $2', params: [mod, name] });
  return Number(row!.res_id);
};
const utcDay = (offset = 0) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const ticket = async (env: Env, values: Record<string, unknown> = {}) => (await env.model('x.ticket').create({ name: 'T', ...values })).ids[0]!;
const messageCount = async (model: string, resId: number) => root.model('mail.message').searchCount([['model', '=', model], ['res_id', '=', resId]]);

beforeAll(async () => {
  manager = new PgliteTenantManager({ catalog: new ModuleCatalog([baseModule, mailModule, testModule]) });
  h = await manager.create('mail', ['mail_test']);
  root = h.env({ uid: 1 });
  const company = await ref('base.main_company');
  const user = await ref('base.group_user');
  [aliceUid] = (await root.model('res.users').create({ name: 'Alice', login: 'alice', company_id: company, company_ids: [company], group_ids: [user] })).ids as [number];
  [bobUid] = (await root.model('res.users').create({ name: 'Bob', login: 'bob', company_id: company, company_ids: [company], group_ids: [user] })).ids as [number];
  alice = h.env({ uid: aliceUid });
  bob = h.env({ uid: bobUid });
  const portalGroup = await ref('base.group_portal');
  const [portalUid] = (await root.model('res.users').create({
    name: 'Portal', login: 'portal', company_id: company, company_ids: [company], group_ids: [portalGroup],
  })).ids;
  portal = h.env({ uid: portalUid! });
  const users = await root.model('res.users').browse([aliceUid, bobUid]).read(['partner_id']);
  alicePartner = users[0]!.partner_id as number;
  bobPartner = users[1]!.partner_id as number;
  customer = (await root.model('res.partner').create({ name: 'Customer Co', email: 'c@example.test' })).ids[0]!;
}, 120_000);

afterAll(() => manager.closeAll());

describe('html sanitizer', () => {
  it('keeps allow-listed markup and strips active content', () => {
    expect(sanitizeHtml('<p class="x" onclick="evil()">Hi <b>there</b></p>')).toBe('<p class="x">Hi <b>there</b></p>');
    expect(sanitizeHtml('a<script>alert(1)</script>b<style>p{}</style>c')).toBe('abc');
    expect(sanitizeHtml('<img src=x onerror=alert(1)>')).toBe('<img src="x">');
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="java&#x09;script:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="JaVaScRiPt&colon;alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="https://ok.test/?a=1&amp;b=2" target="_blank">x</a>'))
      .toBe('<a href="https://ok.test/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">x</a>');
    expect(sanitizeHtml('<svg><script>x</script><a>y</a></svg>z<iframe src="//e"></iframe>')).toBe('z');
    expect(sanitizeHtml('<div style="background:url(javascript:x)"><!-- c -->t</div>')).toBe('<div>t</div>');
    expect(sanitizeHtml('<p>unclosed <i>tags')).toBe('<p>unclosed <i>tags</i></p>');
    expect(sanitizeHtml('1 < 2 &amp; 3 > 2 & <x-y>z</x-y>')).toBe('1 &lt; 2 &amp; 3 &gt; 2 &amp; z');
    expect(sanitizeHtml('<p title="a&quot; onmouseover=&quot;x">t</p>')).toBe('<p title="a&quot; onmouseover=&quot;x">t</p>');
    expect(sanitizeHtml('</p><b>x<img src="data:image/png;base64,AAAA">')).toBe('<b>x<img src="data:image/png;base64,AAAA"></b>');
    expect(sanitizeHtml('<img src="data:text/html;base64,AAAA"><b <script>')).toBe('<img><b></b>');
    expect(safeUrl('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(safeUrl('vbscript:x')).toBeNull();
  });
});

describe('template syntax', () => {
  it('parses blocks and rejects malformed templates', () => {
    expect(parseTemplate('{% if a %}x{% elif b %}y{% else %}z{% endif %}{% for l in line_ids %}{{ l.name }}{% endfor %}{# c #}')).toHaveLength(2);
    expect(() => parseTemplate('{% if a %}x')).toThrow(ValidationError);
    expect(() => parseTemplate('{{ a + }}')).toThrow(ValidationError);
    expect(() => parseTemplate('{% endfor %}')).toThrow(ValidationError);
    expect(() => parseTemplate('{{ a | shout }}')).toThrow(/unknown filter/);
    expect(() => parseTemplate('{% for record in x %}{% endfor %}')).toThrow(/loop variable/);
    expect(() => parseTemplate('{{ a')).toThrow(/unclosed/);
  });
});

describe('chatter', () => {
  it('posts sanitized messages with document write access and lets readers list them', async () => {
    const id = await ticket(alice, { partner_id: customer });
    const thread = new MailThreadService(alice);
    const msg = await thread.post('x.ticket', id, { body: '<p onclick="x()">Hello<script>bad()</script></p>', subject: 'Hi', partnerIds: [customer] });
    const [row] = await new MailThreadService(bob).messages('x.ticket', id);
    expect(row).toMatchObject({ id: msg, body: '<p>Hello</p>', subject: 'Hi', message_type: 'comment', subtype: 'Discussions', internal: false, author_id: alicePartner, author: 'Alice', partner_ids: [customer] });
    // bob can read alice's ticket but not write it: no posting
    await expect(new MailThreadService(bob).post('x.ticket', id, { body: 'nope' })).rejects.toBeInstanceOf(AccessError);
    // messages are not directly readable by ordinary users
    await expect(bob.model('mail.message').browse(msg).read(['body'])).rejects.toBeInstanceOf(AccessError);
    await expect(thread.post('x.ticket', id, { body: '<script>x</script>' })).rejects.toThrow(/empty/);
    // mixin fields and method
    const [rec] = await alice.model('x.ticket').browse(id).read(['message_ids', 'message_follower_ids']);
    expect(rec!.message_ids).toEqual([msg]);
    const posted = await alice.model('x.ticket').browse(id).call('message_post', { body: 'note', subtype: 'mail.mt_note' }) as number[];
    expect((await thread.messages('x.ticket', id))[0]).toMatchObject({ id: posted[0], internal: true, subtype: 'Note' });
  });

  it('returns only public comments with a minimal, re-sanitized projection', async () => {
    const id = await ticket(alice);
    const thread = new MailThreadService(alice);
    await thread.post('x.ticket', id, {
      body: '<p>Public <a href="https://example.test" target="_blank">link</a><img src="https://track.test/pixel"></p>',
      subject: 'Visible',
    });
    await thread.post('x.ticket', id, {
      body: '<p>Internal secret</p>', subject: 'Private', subtype: 'mail.mt_note',
    });

    const rows = await new MailThreadService(portal).portalMessages('x.ticket', id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      subject: 'Visible',
      body: '<p>Public <a href="https://example.test" target="_blank" rel="noopener noreferrer">link</a></p>',
    });
    expect(Object.keys(rows[0]!).sort()).toEqual(['body', 'date', 'id', 'subject']);
    expect(JSON.stringify(rows)).not.toMatch(/Internal secret|Private|track\.test|author|partner_ids|attachment_ids|tracking/);
    const [outsider] = (await root.model('res.users').create({
      name: 'Outsider', login: 'outsider', company_id: await ref('base.main_company'),
    })).ids;
    await expect(new MailThreadService(h.env({ uid: outsider! })).portalMessages('x.ticket', id)).rejects.toBeInstanceOf(AccessError);
    await expect(new MailThreadService(portal).portalMessages('x.ticket', id + 999)).rejects.toBeInstanceOf(AccessError);
  });

  it('auto-subscribes creators and checks follower changes', async () => {
    const id = await ticket(alice);
    const thread = new MailThreadService(bob);
    expect((await thread.followers('x.ticket', id)).map((f) => f.partner_id)).toEqual([alicePartner]);
    await thread.subscribe('x.ticket', id); // self, read access is enough
    await expect(thread.subscribe('x.ticket', id, [customer])).rejects.toBeInstanceOf(AccessError);
    await expect(thread.unsubscribe('x.ticket', id, [alicePartner])).rejects.toBeInstanceOf(AccessError);
    await new MailThreadService(alice).subscribe('x.ticket', id, [customer, bobPartner]); // idempotent for bob
    expect((await thread.followers('x.ticket', id)).map((f) => f.partner_id).sort()).toEqual([alicePartner, bobPartner, customer].sort());
    await thread.unsubscribe('x.ticket', id);
    expect((await thread.followers('x.ticket', id)).map((f) => f.partner_id)).not.toContain(bobPartner);
    const noSub = (await alice.withContext({ mail_create_nosubscribe: true }).model('x.ticket').create({ name: 'quiet' })).ids[0]!;
    expect(await thread.followers('x.ticket', noSub)).toEqual([]);
  });
});

describe('field tracking', () => {
  it('records typed tracking values for changed tracked fields only', async () => {
    const id = await ticket(alice, { name: 'Old', amount: 1.5, priority: 1 });
    const before = await messageCount('x.ticket', id);
    await alice.model('x.ticket').browse(id).write({ note: 'untracked' });
    await alice.model('x.ticket').browse(id).write({ name: 'Old', amount: 1.5 }); // unchanged values
    expect(await messageCount('x.ticket', id)).toBe(before);
    await alice.model('x.ticket').browse(id).write({ name: 'New', state: 'done', partner_id: customer, amount: 2.25, priority: 3, deadline: '2026-03-04' });
    const [msg] = await new MailThreadService(bob).messages('x.ticket', id, { limit: 1 });
    expect(msg).toMatchObject({ message_type: 'notification', subtype: 'Note', author_id: alicePartner, body: '' });
    const byField = Object.fromEntries(msg!.tracking.map((t) => [t.field, t]));
    expect(byField.name).toMatchObject({ field_desc: 'Title', old_value_char: 'Old', new_value_char: 'New' });
    expect(byField.state).toMatchObject({ field_desc: 'Status', field_type: 'selection', old_value_char: 'New', new_value_char: 'Done' });
    expect(byField.partner_id).toMatchObject({ old_value_integer: null, new_value_integer: customer, new_value_char: 'Customer Co' });
    expect(byField.amount).toMatchObject({ old_value_float: 1.5, new_value_float: 2.25 });
    expect(byField.priority).toMatchObject({ old_value_integer: 1, new_value_integer: 3 });
    expect(String(byField.deadline!.new_value_datetime instanceof Date ? (byField.deadline!.new_value_datetime as Date).toISOString() : byField.deadline!.new_value_datetime)).toContain('2026-03-0');
    expect(Object.keys(byField).sort()).toEqual(['amount', 'deadline', 'name', 'partner_id', 'priority', 'state']);
  });

  it('hides tracking values of fields the reader cannot see', async () => {
    const id = await ticket(alice);
    await root.model('x.ticket').browse(id).write({ secret: 's3cret', name: 'visible' });
    const [mine] = await new MailThreadService(bob).messages('x.ticket', id, { limit: 1 });
    expect(mine!.tracking.map((t) => t.field)).toEqual(['name']);
    expect(JSON.stringify(mine)).not.toContain('s3cret');
    const [admin] = await new MailThreadService(root).messages('x.ticket', id, { limit: 1 });
    expect(admin!.tracking.map((t) => t.field).sort()).toEqual(['name', 'secret']);
  });

  it('does not fire for models without the mixin or with tracking disabled', async () => {
    const [plain] = (await alice.model('x.plain').create({ name: 'a' })).ids;
    await alice.model('x.plain').browse(plain!).write({ name: 'b' });
    expect(await messageCount('x.plain', plain!)).toBe(0);
    const id = await ticket(alice);
    const before = await messageCount('x.ticket', id);
    await alice.withContext({ tracking_disable: true }).model('x.ticket').browse(id).write({ name: 'silent' });
    expect(await messageCount('x.ticket', id)).toBe(before);
  });

  it('works together with automation rules and rolls back with the write', async () => {
    const actions = new ServerActionService(root);
    await actions.define({ key: 'xt.mark', model: 'x.ticket', type: 'update_record', values: { note: "'automated'" } });
    await actions.define({ key: 'xt.say', model: 'x.ticket', type: 'post_message', message: "'Closed <' + name + '>'" });
    await actions.define({ key: 'xt.both', model: 'x.ticket', type: 'multi', children: ['xt.mark', 'xt.say'] });
    const rules = new AutomationRuleService(root);
    await rules.define({ key: 'xt.done', model: 'x.ticket', trigger: 'on_write', filter: [['state', '=', 'done']], action: 'xt.both' });
    try {
      const id = await ticket(alice, { name: 'Auto' });
      await alice.model('x.ticket').browse(id).write({ state: 'done' });
      const [rec] = await alice.model('x.ticket').browse(id).read(['note']);
      expect(rec!.note).toBe('automated');
      const messages = await new MailThreadService(alice).messages('x.ticket', id);
      // post_message action now creates a mail.message (escaped text), plus the tracking message
      expect(messages.map((m) => m.body)).toContain('<p>Closed &lt;Auto&gt;</p>');
      expect(messages.some((m) => m.tracking.some((t) => t.field === 'state'))).toBe(true);
      // failing write: the tracking message disappears with it
      const count = await messageCount('x.ticket', id);
      await expect(alice.transaction(async (env) => {
        await env.model('x.ticket').browse(id).write({ name: 'rolled back' });
        throw new ValidationError('boom');
      })).rejects.toThrow('boom');
      expect(await messageCount('x.ticket', id)).toBe(count);
    } finally {
      await rules.define({ key: 'xt.done', model: 'x.ticket', trigger: 'on_write', action: 'xt.both', enabled: false });
    }
  });

  it('routes AuditService.post to mail.message when mail is installed', async () => {
    const id = await ticket(alice);
    const msg = await new AuditService(alice).post('x.ticket', id, 'line1\n<b>line2</b>');
    const [row] = await root.model('mail.message').browse(msg).read(['body', 'model', 'res_id']);
    expect(row).toMatchObject({ body: '<p>line1<br>&lt;b&gt;line2&lt;/b&gt;</p>', model: 'x.ticket', res_id: id });
    await expect(new AuditService(bob).post('x.ticket', id, 'x')).rejects.toBeInstanceOf(AccessError);
  });
});

describe('activities', () => {
  it('schedules with type delays, computes states and lists my activities', async () => {
    const id = await ticket(alice);
    const service = new ActivityService(alice);
    const todo = await service.schedule('x.ticket', id, { summary: 'Follow up' });
    const late = await service.schedule('x.ticket', id, { activityType: 'mail_activity_data_call', dateDeadline: utcDay(-1) });
    const rows = await new ActivityService(bob).list('x.ticket', id);
    expect(rows.map((r) => [r.id, r.date_deadline, r.state])).toEqual([[late, utcDay(-1), 'overdue'], [todo, utcDay(5), 'planned']]);
    const [doc] = await alice.model('x.ticket').browse(id).read(['activity_ids', 'activity_state']);
    expect(doc).toMatchObject({ activity_ids: [late, todo], activity_state: 'overdue' });
    await expect(new ActivityService(bob).schedule('x.ticket', id, {})).rejects.toBeInstanceOf(AccessError);
    // bob cannot bypass the service through the ORM either
    await expect(bob.model('mail.activity').create({ res_model: 'x.ticket', res_id: id, date_deadline: utcDay(), user_id: bobUid })).rejects.toThrow(/forbid|unavailable/);
    const today = await service.schedule('x.ticket', id, { dateDeadline: utcDay(), userId: bobUid });
    expect((await new ActivityService(bob).mine()).map((a) => [a.id, a.state])).toEqual([[today, 'today']]);
    expect(await new ActivityService(bob).documentDomain('x.ticket', { mine: true })).toEqual([['id', 'in', [id]]]);
    const found = await bob.model('x.ticket').search(await new ActivityService(bob).documentDomain('x.ticket', { state: 'overdue' }));
    expect(found.ids).toContain(id);
  });

  it('sanitizes activity notes on every ORM path', async () => {
    const id = await ticket(alice);
    const [act] = (await alice.model('mail.activity').create({
      res_model: 'x.ticket', res_id: id, date_deadline: utcDay(), note: '<img src=x onerror=alert(1)><p>ok</p><script>x</script>',
    })).ids;
    expect((await alice.model('mail.activity').browse(act!).read(['note']))[0]!.note).toBe('<img src="x"><p>ok</p>');
    await alice.model('mail.activity').browse(act!).write({ note: '<a href="javascript:x" onmouseover="y">l</a>' });
    expect((await alice.model('mail.activity').browse(act!).read(['note']))[0]!.note).toBe('<a>l</a>');
  });

  it('marks done: posts a message, chains the next type and enforces assignee rights', async () => {
    const id = await ticket(alice);
    const call = await ref('mail.mail_activity_data_call');
    const [next] = (await root.model('mail.activity.type').create({ name: 'Send quote', delay_count: 1, delay_unit: 'weeks' })).ids;
    await root.model('mail.activity.type').browse(call).write({ next_type_id: next });
    try {
      const activity = await new ActivityService(alice).schedule('x.ticket', id, { activityType: call, summary: 'Ring <them>', userId: aliceUid });
      await expect(new ActivityService(bob).done([activity])).rejects.toBeInstanceOf(AccessError);
      const [msg] = await new ActivityService(alice).done([activity], 'Talked');
      const [posted] = await new MailThreadService(alice).messages('x.ticket', id, { limit: 1 });
      expect(posted).toMatchObject({ id: msg, subtype: 'Activities', body: '<p>Call: Ring &lt;them&gt; done</p><p>Talked</p>' });
      const remaining = await new ActivityService(alice).list('x.ticket', id);
      expect(remaining.map((a) => [a.activity_type_id, a.date_deadline])).toEqual([[next, utcDay(7)]]);
      // assignee (not creator, no document write access) may complete it
      const delegated = await new ActivityService(alice).schedule('x.ticket', id, { userId: bobUid });
      await new ActivityService(bob).done([delegated]);
      expect((await new ActivityService(alice).list('x.ticket', id)).map((a) => a.id)).not.toContain(delegated);
    } finally {
      await root.model('mail.activity.type').browse(call).write({ next_type_id: false });
    }
  });
});

describe('templates', () => {
  it('renders with escaping, blocks, loops and formatting as the caller', async () => {
    const usd = await ref('base.USD');
    const id = await ticket(alice, { name: '<b>Big</b> {{ 1 + 1 }}', partner_id: customer, amount: 1234.5, currency_id: usd, deadline: '2026-02-03' });
    await alice.model('x.ticket.line').create([{ ticket_id: id, name: 'A&B', qty: 2 }, { ticket_id: id, name: 'C', qty: 0 }]);
    const [tpl] = (await root.model('mail.template').create({
      name: 'Ticket', model_name: 'x.ticket', subject: 'Ticket {{ name }}', email_to: 'partner_id.email', partner_to: 'partner_id',
      body_html: '<p>Hello {{ partner_id.name }}</p>{% if amount > 1000 %}<p>Total {{ amount | money(currency_id) }}</p>{% else %}small{% endif %}'
        + '<ul>{% for line in line_ids %}{% if line.qty %}<li>{{ line.name }} x{{ line.qty }}</li>{% endif %}{% endfor %}</ul>'
        + '<p>Due {{ deadline | date }}</p><a href="{{ name }}" onclick="x">l</a>',
    })).ids;
    const [mail] = await new MailTemplateService(alice).render(tpl!, [id]);
    expect(mail).toMatchObject({
      res_id: id, subject: 'Ticket <b>Big</b> {{ 1 + 1 }}', email_to: 'c@example.test', partner_ids: [customer], lang: 'en_US',
      body_html: '<p>Hello Customer Co</p><p>Total $ 1,234.50</p><ul><li>A&amp;B x2</li></ul><p>Due 02/03/2026</p>'
        + '<a href="&lt;b&gt;Big&lt;/b&gt; {{ 1 + 1 }}">l</a>',
    });
    // lang expression switches the formatting conventions
    const [fr] = await h.driver.query<{ date_format: string }>({ text: `SELECT date_format FROM res_lang WHERE code='fr_FR'`, params: [] });
    const [french] = await new MailTemplateService(alice).renderInline('x.ticket', [id], { body_html: '{{ deadline | date }}', lang: "'fr_FR'" });
    expect(french!.lang).toBe('fr_FR');
    expect(french!.body_html).toBe(fr!.date_format.replace('%d', '03').replace('%m', '02').replace('%Y', '2026'));

    // send stores the rendered mail as a message (no delivery)
    const msg = await new MailTemplateService(alice).send(tpl!, id);
    const [stored] = await root.model('mail.message').browse(msg).read(['message_type', 'subject', 'partner_ids', 'email_to']);
    expect(stored).toMatchObject({ message_type: 'email', subject: 'Ticket <b>Big</b> {{ 1 + 1 }}', partner_ids: [customer], email_to: 'c@example.test' });
    await expect(new MailTemplateService(bob).send(tpl!, id)).rejects.toBeInstanceOf(AccessError);
    // rendering only needs read access to the template and the records
    expect((await new MailTemplateService(bob).render(tpl!, [id]))[0]!.subject).toContain('Big');
  });

  it('validates templates and enforces quotas', async () => {
    await expect(root.model('mail.template').create({ name: 'bad', model_name: 'x.ticket', body_html: '{% if x %}' })).rejects.toThrow(ValidationError);
    await expect(root.model('mail.template').create({ name: 'bad', model_name: 'nope', body_html: 'x' })).rejects.toThrow(ValidationError);
    await expect(bob.model('mail.template').create({ name: 'mine', model_name: 'x.ticket' })).rejects.toBeInstanceOf(AccessError);
    const id = await ticket(alice);
    await alice.model('x.ticket.line').create([{ ticket_id: id, name: 'a' }, { ticket_id: id, name: 'b' }, { ticket_id: id, name: 'c' }]);
    const service = new MailTemplateService(alice);
    await expect(service.renderInline('x.ticket', [id], { body_html: '{{ secret_field }}' })).rejects.toThrow(/unknown field/);
    await alice.model('x.ticket').browse(id).write({ note: 'javascript:alert(1)' });
    const [link] = await service.renderInline('x.ticket', [id], { body_html: '<a href="{{ note }}">x</a><img src={{ note }} onerror=alert(1)>' });
    expect(link!.body_html).toBe('<a>x</a><img>');
    // nested blocks count their output once
    const savedQuota = TEMPLATE_LIMITS.maxOutput;
    TEMPLATE_LIMITS.maxOutput = 6;
    try {
      const [nested] = await service.renderInline('x.ticket', [id], { body_html: '{% if true %}{% for l in line_ids %}{% if l.name %}ab{% endif %}{% endfor %}{% endif %}' });
      expect(nested!.body_html).toBe('ababab');
      await expect(service.renderInline('x.ticket', [id], { body_html: '{% if true %}{% for l in line_ids %}abc{% endfor %}{% endif %}' })).rejects.toThrow(/output quota/);
    } finally {
      TEMPLATE_LIMITS.maxOutput = savedQuota;
    }
    // expression failures in lang / email_to / partner_to are validation errors
    await expect(service.renderInline('x.ticket', [id], { body_html: 'x', partner_to: 'name + 1' })).rejects.toBeInstanceOf(ValidationError);
    await expect(service.renderInline('x.ticket', [id], { body_html: 'x', lang: 'missing_fn(1)' })).rejects.toBeInstanceOf(ValidationError);
    // email_to cannot inject header lines
    await alice.model('x.ticket').browse(id).write({ note: 'a@b.test\r\nBcc: evil@x.test' });
    const [hdr] = await service.renderInline('x.ticket', [id], { body_html: 'x', email_to: 'note' });
    expect(hdr!.email_to).toBe('a@b.test Bcc: evil@x.test');
    // record.<path> loads through the caller's access; group-restricted fields never render
    await alice.model('x.ticket').browse(id).write({ partner_id: customer });
    await root.model('x.ticket').browse(id).write({ secret: 'TOPSECRET' });
    const [rel] = await service.renderInline('x.ticket', [id], { body_html: '{{ record.partner_id.name }}' });
    expect(rel!.body_html).toBe('Customer Co');
    const leak = await service.renderInline('x.ticket', [id], { body_html: '{{ record.secret }}' }).then((r) => r[0]!.body_html, (e: unknown) => e);
    expect(leak).toBeInstanceOf(AccessError);
    const saved = TEMPLATE_LIMITS.maxIterations;
    TEMPLATE_LIMITS.maxIterations = 5;
    try {
      await expect(service.renderInline('x.ticket', [id], { body_html: '{% for a in line_ids %}{% for b in line_ids %}x{% endfor %}{% endfor %}' }))
        .rejects.toThrow(/loop quota/);
    } finally {
      TEMPLATE_LIMITS.maxIterations = saved;
    }
    const savedOut = TEMPLATE_LIMITS.maxOutput;
    TEMPLATE_LIMITS.maxOutput = 10;
    try {
      await expect(service.renderInline('x.ticket', [id], { body_html: 'abcdefghijklmnop' })).rejects.toThrow(/output quota/);
    } finally {
      TEMPLATE_LIMITS.maxOutput = savedOut;
    }
  });
});

describe('document cleanup', () => {
  it('keeps mail data when the unlink fails', async () => {
    const id = await ticket(alice);
    await new MailThreadService(alice).post('x.ticket', id, { body: 'stay' });
    await alice.model('x.ticket.ref').create({ ticket_id: id });
    const before = await messageCount('x.ticket', id);
    await expect(alice.model('x.ticket').browse(id).unlink()).rejects.toThrow();
    expect(await messageCount('x.ticket', id)).toBe(before);
    expect(await root.model('mail.followers').searchCount([['res_model', '=', 'x.ticket'], ['res_id', '=', id]])).toBe(1);
  });

  it('declares database cascades for the raw purge', async () => {
    const rows = await h.driver.query<{ t: string; c: string }>({
      text: `SELECT conrelid::regclass::text AS t, confdeltype::text AS c FROM pg_constraint
        WHERE contype = 'f' AND conrelid::regclass::text IN ('mail_tracking_value', 'mail_message_res_partner_rel', 'mail_followers_subtype_rel')
          AND confrelid::regclass::text IN ('mail_message', 'mail_followers')`, params: [],
    });
    expect(rows.map((r) => r.t).sort()).toEqual(['mail_followers_subtype_rel', 'mail_message_res_partner_rel', 'mail_tracking_value']);
    expect(rows.every((r) => r.c === 'c')).toBe(true);
  });

  it('removes messages, followers and activities with the document', async () => {
    const id = await ticket(alice);
    await new MailThreadService(alice).post('x.ticket', id, { body: 'bye' });
    await new ActivityService(alice).schedule('x.ticket', id);
    await alice.model('x.ticket').browse(id).unlink();
    expect(await messageCount('x.ticket', id)).toBe(0);
    expect(await root.model('mail.followers').searchCount([['res_model', '=', 'x.ticket'], ['res_id', '=', id]])).toBe(0);
    expect(await root.model('mail.activity').searchCount([['res_model', '=', 'x.ticket'], ['res_id', '=', id]])).toBe(0);
  });
});
