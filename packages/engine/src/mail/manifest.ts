import { ValidationError, type AccessRule, type Env, type ModelDef, type ModuleManifest, type Recordset, type RecordRule } from '../contracts/index.js';
import { tenantDriver } from '../services/common.js';
import {
  checkActivityDocument, computeActivityIds, computeActivityState, computeDocumentActivityState,
} from './activity.js';
import './hooks.js'; // the module manifest brings its record hooks along
import { MailThreadService, type MessagePostOptions } from './thread.js';
import { validateTemplate } from './template.js';

const all = { read: true, write: true, create: true, unlink: true };
const readOnly = { read: true, write: false, create: false, unlink: false };
const SYSTEM = 'base.group_system';
const USER = 'base.group_user';

const VALUE_FIELDS = ['char', 'integer', 'float', 'datetime'] as const;

const threadMessages = async (records: Recordset) => {
  const rows = await records.env.sudo().model('mail.message').searchRead(
    [['model', '=', records.model], ['res_id', 'in', [...records.ids]]], ['res_id'], { order: 'date desc, id desc' },
  );
  const out = new Map<number, number[]>(records.ids.map((id) => [id, []]));
  for (const r of rows) out.get(r.res_id as number)?.push(r.id as number);
  return out;
};

const threadFollowers = async (records: Recordset) => {
  const rows = await records.env.sudo().model('mail.followers').searchRead(
    [['res_model', '=', records.model], ['res_id', 'in', [...records.ids]]], ['res_id'],
  );
  const out = new Map<number, number[]>(records.ids.map((id) => [id, []]));
  for (const r of rows) out.get(r.res_id as number)?.push(r.id as number);
  return out;
};

async function checkTemplates(records: Recordset): Promise<void> {
  const rows = await records.env.sudo().model('mail.template').browse([...records.ids])
    .read(['model_name', 'subject', 'body_html', 'email_to', 'partner_to', 'lang']);
  for (const row of rows) {
    if (typeof row.model_name !== 'string' || !(records.env as unknown as { registry: { models: Map<string, unknown> } }).registry.models.has(row.model_name)) {
      throw new ValidationError(`Unknown template model '${String(row.model_name)}'`);
    }
    validateTemplate(row as never);
  }
}

/** Models of the mail module (Odoo mail concepts; own implementation). */
export const mailModels: ModelDef[] = [
  {
    name: 'mail.message.subtype', origin: 'module', order: 'sequence asc, id asc', description: 'Message Subtype',
    fields: {
      name: { type: 'char', required: true, translate: true },
      description: { type: 'text' },
      internal: { type: 'boolean', default: false, help: 'Internal notes are hidden from external (portal) readers' },
      default: { type: 'boolean', default: true, help: 'New followers receive this subtype' },
      res_model: { type: 'char', string: 'Model', help: 'Only for this model (empty: all models)' },
      sequence: { type: 'integer', default: 1 },
      hidden: { type: 'boolean', default: false },
    },
  },
  {
    name: 'mail.message', origin: 'module', order: 'date desc, id desc', recName: 'subject', description: 'Message',
    fields: {
      model: { type: 'char', required: true, index: true, string: 'Related Document Model' },
      res_id: { type: 'integer', required: true, index: true, string: 'Related Document ID' },
      body: { type: 'html' },
      subject: { type: 'char' },
      message_type: {
        type: 'selection', required: true, default: 'comment',
        selection: [['comment', 'Comment'], ['notification', 'System notification'], ['email', 'Email']],
      },
      subtype_id: { type: 'many2one', comodel: 'mail.message.subtype', ondelete: 'set null', string: 'Subtype' },
      author_id: { type: 'many2one', comodel: 'res.partner', ondelete: 'set null', string: 'Author' },
      partner_ids: { type: 'many2many', comodel: 'res.partner', relationTable: 'mail_message_res_partner_rel', column1: 'message_id', column2: 'partner_id', string: 'Recipients' },
      attachment_ids: { type: 'json', string: 'Attachments', help: 'nx_attachment ids of the same document' },
      tracking_value_ids: { type: 'one2many', comodel: 'mail.tracking.value', inverseName: 'message_id', string: 'Tracking values' },
      email_to: { type: 'char', string: 'To (emails)' },
      date: { type: 'datetime', required: true, index: true },
    },
  },
  {
    name: 'mail.tracking.value', origin: 'module', order: 'id asc', description: 'Tracking Value',
    fields: {
      message_id: { type: 'many2one', comodel: 'mail.message', required: true, ondelete: 'cascade', index: true },
      field: { type: 'char', required: true },
      field_desc: { type: 'char', required: true, string: 'Field Description' },
      field_type: { type: 'char', required: true },
      ...Object.fromEntries(VALUE_FIELDS.flatMap((t) => [
        [`old_value_${t}`, { type: t }], [`new_value_${t}`, { type: t }],
      ])),
    },
  },
  {
    name: 'mail.followers', origin: 'module', order: 'id asc', description: 'Document Follower',
    fields: {
      res_model: { type: 'char', required: true, index: true },
      res_id: { type: 'integer', required: true, index: true },
      partner_id: { type: 'many2one', comodel: 'res.partner', required: true, ondelete: 'cascade', index: true },
      subtype_ids: { type: 'many2many', comodel: 'mail.message.subtype', relationTable: 'mail_followers_subtype_rel', column1: 'follower_id', column2: 'subtype_id' },
    },
    constraints: [{ name: 'mail_followers_uniq', sql: 'UNIQUE(res_model, res_id, partner_id)', message: 'A partner follows a document once' }],
  },
  {
    name: 'mail.activity.type', origin: 'module', order: 'sequence asc, id asc', description: 'Activity Type',
    fields: {
      name: { type: 'char', required: true, translate: true },
      summary: { type: 'char', string: 'Default Summary' },
      sequence: { type: 'integer', default: 10 },
      delay_count: { type: 'integer', default: 0, string: 'Schedule' },
      delay_unit: { type: 'selection', required: true, default: 'days', selection: [['days', 'days'], ['weeks', 'weeks'], ['months', 'months']] },
      default_user_id: { type: 'many2one', comodel: 'res.users', ondelete: 'set null', string: 'Default User' },
      next_type_id: { type: 'many2one', comodel: 'mail.activity.type', ondelete: 'set null', string: 'Chained Activity' },
      res_model: { type: 'char', string: 'Model', help: 'Only for this model (empty: all models)' },
      active: { type: 'boolean', default: true },
    },
    constraints: [{
      name: 'mail_activity_type_delay', fields: ['delay_count'],
      check: async (records) => {
        for (const row of await records.read(['delay_count'])) {
          const n = row.delay_count as number;
          if (!Number.isSafeInteger(n) || n < 0 || n > 3650) throw new ValidationError('Activity delay must be 0 to 3650');
        }
      },
    }],
  },
  {
    name: 'mail.activity', origin: 'module', order: 'date_deadline asc, id asc', recName: 'summary', description: 'Activity',
    fields: {
      res_model: { type: 'char', required: true, index: true },
      res_id: { type: 'integer', required: true, index: true },
      activity_type_id: { type: 'many2one', comodel: 'mail.activity.type', ondelete: 'restrict', string: 'Activity Type' },
      summary: { type: 'char' },
      note: { type: 'html' },
      date_deadline: { type: 'date', required: true, index: true, string: 'Due Date' },
      user_id: { type: 'many2one', comodel: 'res.users', required: true, ondelete: 'cascade', index: true, string: 'Assigned to', default: (env: Env) => env.uid },
      state: {
        type: 'selection', compute: computeActivityState, readonly: true,
        selection: [['overdue', 'Overdue'], ['today', 'Today'], ['planned', 'Planned']],
      },
    },
    constraints: [{ name: 'mail_activity_document', check: checkActivityDocument, fields: ['res_model', 'res_id'] }],
  },
  {
    name: 'mail.template', origin: 'module', order: 'name asc', description: 'Email Template',
    fields: {
      name: { type: 'char', required: true },
      model_name: { type: 'char', required: true, string: 'Applies to' },
      subject: { type: 'char', translate: true },
      body_html: { type: 'html', translate: true, string: 'Body' },
      email_to: { type: 'char', string: 'To (emails expression)' },
      partner_to: { type: 'char', string: 'To (partners expression)' },
      lang: { type: 'char', string: 'Language expression' },
      active: { type: 'boolean', default: true },
    },
    constraints: [{ name: 'mail_template_valid', check: checkTemplates }],
  },
  {
    name: 'mail.thread', abstract: true, origin: 'module', description: 'Discussion thread (mixin)',
    fields: {
      message_ids: { type: 'many2many', comodel: 'mail.message', compute: threadMessages, string: 'Messages' },
      message_follower_ids: { type: 'many2many', comodel: 'mail.followers', compute: threadFollowers, string: 'Followers' },
    },
    methods: {
      /** records.call('message_post', { body, subject, subtype, partnerIds, attachmentIds }) -> message ids */
      message_post: async (records: Recordset, options?: unknown) => {
        const service = new MailThreadService(records.env);
        const ids: number[] = [];
        for (const id of records.ids) ids.push(await service.post(records.model, id, (options ?? {}) as MessagePostOptions));
        return ids;
      },
      message_subscribe: async (records: Recordset, partnerIds?: unknown, subtypes?: unknown) => {
        const service = new MailThreadService(records.env);
        for (const id of records.ids) await service.subscribe(records.model, id, partnerIds as number[] | undefined, subtypes as (number | string)[] | undefined);
        return true;
      },
      message_unsubscribe: async (records: Recordset, partnerIds?: unknown) => {
        const service = new MailThreadService(records.env);
        for (const id of records.ids) await service.unsubscribe(records.model, id, partnerIds as number[] | undefined);
        return true;
      },
    },
  },
  {
    name: 'mail.activity.mixin', abstract: true, origin: 'module', description: 'Activities (mixin)',
    fields: {
      activity_ids: { type: 'many2many', comodel: 'mail.activity', compute: computeActivityIds, string: 'Activities' },
      activity_state: {
        type: 'selection', compute: computeDocumentActivityState, string: 'Activity State',
        selection: [['overdue', 'Overdue'], ['today', 'Today'], ['planned', 'Planned']],
      },
    },
  },
];

/**
 * Messages, tracking values and followers are reachable only through MailThreadService (which checks
 * the document); administrators keep direct read access for support. Activities are visible to their
 * assignee / creator (record rule); document readers see them through ActivityService.
 */
export const mailAccess: AccessRule[] = [
  ...['mail.message', 'mail.tracking.value', 'mail.followers'].map((model) => ({ model, group: SYSTEM, perms: readOnly })),
  ...['mail.message.subtype', 'mail.activity.type', 'mail.template'].flatMap((model) => [
    { model, group: USER, perms: readOnly }, { model, group: SYSTEM, perms: all },
  ]),
  { model: 'mail.activity', group: USER, perms: all },
];

export const mailRules: RecordRule[] = [
  {
    name: 'mail_activity_own', model: 'mail.activity', groups: [USER], perms: all,
    domain: ['|', ['user_id', '=', { $ctx: 'uid' } as never], ['create_uid', '=', { $ctx: 'uid' } as never]],
  },
  { name: 'mail_activity_admin', model: 'mail.activity', groups: [SYSTEM], perms: all, domain: [] },
];

export const mailModule: ModuleManifest = {
  name: 'mail',
  version: '1.0.0',
  summary: 'Chatter, activities, templates, outgoing mail and inbound aliases',
  depends: ['base'],
  models: mailModels,
  access: mailAccess,
  rules: mailRules,
  hooks: {
    async uninstall(env) {
      await tenantDriver(env).query({
        text: 'DROP TABLE IF EXISTS nx_mail_inbound_receipt, nx_mail_alias, nx_mail_outgoing, nx_mail_template_request',
        params: [],
      });
    },
  },
  data: [
    { xmlId: 'mt_comment', model: 'mail.message.subtype', values: { name: 'Discussions', sequence: 0, internal: false, default: true } },
    { xmlId: 'mt_note', model: 'mail.message.subtype', values: { name: 'Note', sequence: 100, internal: true, default: false } },
    { xmlId: 'mt_activities', model: 'mail.message.subtype', values: { name: 'Activities', sequence: 90, internal: true, default: true } },
    { xmlId: 'mail_activity_data_todo', model: 'mail.activity.type', values: { name: 'To-Do', sequence: 1, delay_count: 5, delay_unit: 'days' }, noUpdate: true },
    { xmlId: 'mail_activity_data_call', model: 'mail.activity.type', values: { name: 'Call', sequence: 2, delay_count: 2, delay_unit: 'days' }, noUpdate: true },
    { xmlId: 'mail_activity_data_meeting', model: 'mail.activity.type', values: { name: 'Meeting', sequence: 3 }, noUpdate: true },
  ],
  actions: [
    { xmlId: 'action_activity_types', type: 'window', name: 'Activity Types', model: 'mail.activity.type', viewTypes: ['list', 'form'] },
    { xmlId: 'action_templates', type: 'window', name: 'Email Templates', model: 'mail.template', viewTypes: ['list', 'form'] },
    { xmlId: 'action_subtypes', type: 'window', name: 'Message Subtypes', model: 'mail.message.subtype', viewTypes: ['list', 'form'] },
  ],
  menus: [
    { xmlId: 'menu_email', name: 'Discuss', parent: 'base.menu_technical', sequence: 20, groups: [SYSTEM] },
    { xmlId: 'menu_activity_types', name: 'Activity Types', parent: 'menu_email', action: 'action_activity_types', sequence: 1 },
    { xmlId: 'menu_templates', name: 'Email Templates', parent: 'menu_email', action: 'action_templates', sequence: 2 },
    { xmlId: 'menu_subtypes', name: 'Subtypes', parent: 'menu_email', action: 'action_subtypes', sequence: 3 },
  ],
};
