import type { AccessRule, ModelDef, RecordRule } from '../contracts/index.js';
import {
  checkAutomationRecords, checkConfigParameters, computeNumberNextActual, checkCronRecords, checkDefaults, checkSequenceRanges, checkSequences,
} from '../services/config.js';

const all = { read: true, write: true, create: true, unlink: true };
const SYSTEM = 'base.group_system';

/**
 * Configuration stored as ordinary records (Odoo ir.sequence / ir.config_parameter / ir.default /
 * ir.cron / base.automation concepts). They are edited through the generic ORM/API; the engine
 * services read them at run time. Every create/write is validated by the services' own rules.
 */
export const configModels: ModelDef[] = [
  {
    name: 'ir.sequence', origin: 'module', module: 'base', order: 'code asc, id asc', description: 'Sequence',
    fields: {
      name: { type: 'char', required: true },
      code: { type: 'char', required: true, index: true },
      prefix: { type: 'char', help: 'Supports %(year)s, %(month)s, %(day)s, %(y)s, %(doy)s, %(woy)s, %(weekday)s, %(h24)s, %(h12)s, %(min)s, %(sec)s and range_* variants' },
      suffix: { type: 'char' },
      padding: { type: 'integer', default: 5, required: true },
      number_next: { type: 'integer', default: 1, required: true, string: 'Next Number' },
      number_next_actual: { type: 'integer', compute: computeNumberNextActual, store: false, string: 'Actual Next Number' },
      number_increment: { type: 'integer', default: 1, required: true, string: 'Step' },
      implementation: {
        type: 'selection', required: true, default: 'standard',
        selection: [['standard', 'Standard'], ['no_gap', 'No gap']],
        help: 'Standard numbers are never rolled back (gaps possible, no locking); No gap locks the counter until commit.',
      },
      company_id: { type: 'many2one', comodel: 'res.company', ondelete: 'cascade' },
      use_date_range: { type: 'boolean', default: false, string: 'Use sub-sequences per date range' },
      date_range_period: { type: 'selection', default: 'year', selection: [['year', 'Yearly'], ['month', 'Monthly']] },
      date_range_ids: { type: 'one2many', comodel: 'ir.sequence.date_range', inverseName: 'sequence_id' },
      active: { type: 'boolean', default: true },
    },
    constraints: [{ name: 'ir_sequence_valid', check: checkSequences }],
  },
  {
    name: 'ir.sequence.date_range', origin: 'module', module: 'base', order: 'date_from desc, id desc', description: 'Sequence Date Range',
    fields: {
      sequence_id: { type: 'many2one', comodel: 'ir.sequence', required: true, ondelete: 'cascade' },
      date_from: { type: 'date', required: true },
      date_to: { type: 'date', required: true },
      number_next: { type: 'integer', default: 1, required: true, string: 'Next Number' },
      number_next_actual: { type: 'integer', compute: computeNumberNextActual, store: false, string: 'Actual Next Number' },
    },
    constraints: [
      { name: 'ir_sequence_date_range_uniq', sql: 'UNIQUE(sequence_id, date_from)' },
      { name: 'ir_sequence_date_range_valid', check: checkSequenceRanges },
    ],
  },
  {
    name: 'ir.config_parameter', origin: 'module', module: 'base', order: 'key asc', recName: 'key', description: 'System Parameter',
    fields: {
      key: { type: 'char', required: true, unique: true },
      value: { type: 'text' },
      is_public: { type: 'boolean', default: false, string: 'Readable by all users' },
    },
    constraints: [{ name: 'ir_config_parameter_valid', check: checkConfigParameters }],
  },
  {
    name: 'ir.default', origin: 'module', module: 'base', order: 'model_name asc, field_name asc, id asc', description: 'Default Value',
    fields: {
      model_name: { type: 'char', required: true, index: true },
      field_name: { type: 'char', required: true },
      value_json: { type: 'text', required: true, string: 'Value (JSON)' },
      user_id: { type: 'many2one', comodel: 'res.users', ondelete: 'cascade' },
      company_id: { type: 'many2one', comodel: 'res.company', ondelete: 'cascade' },
    },
    constraints: [{ name: 'ir_default_valid', check: checkDefaults }],
  },
  {
    name: 'ir.cron', origin: 'module', module: 'base', order: 'key asc', description: 'Scheduled Action',
    fields: {
      name: { type: 'char' },
      key: { type: 'char', required: true, unique: true },
      interval_number: { type: 'integer', required: true, default: 1 },
      interval_type: {
        type: 'selection', required: true, default: 'hours',
        selection: [['seconds', 'Seconds'], ['minutes', 'Minutes'], ['hours', 'Hours'], ['days', 'Days'], ['weeks', 'Weeks']],
      },
      nextcall: { type: 'datetime', string: 'Next Execution' },
      action: { type: 'char', string: 'Server Action' },
      builtin: { type: 'selection', selection: [['automation.on_time', 'Time-based automation rules']] },
      user_id: { type: 'many2one', comodel: 'res.users', ondelete: 'restrict' },
      active: { type: 'boolean', default: true },
    },
    constraints: [
      { name: 'ir_cron_schedule', check: (records) => checkCronRecords(records, false),
        fields: ['key', 'interval_number', 'interval_type', 'action', 'builtin', 'user_id', 'active'] },
      { name: 'ir_cron_nextcall', check: (records) => checkCronRecords(records, true), fields: ['nextcall'] },
    ],
  },
  {
    name: 'ir.automation', origin: 'module', module: 'base', order: 'key asc', description: 'Automation Rule',
    fields: {
      name: { type: 'char' },
      key: { type: 'char', required: true, unique: true },
      model_name: { type: 'char', required: true },
      trigger: {
        type: 'selection', required: true,
        selection: [['on_create', 'On creation'], ['on_write', 'On update'], ['on_create_or_write', 'On creation & update'],
          ['on_unlink', 'On deletion'], ['on_change_fields', 'On field change'], ['on_time', 'Based on date field']],
      },
      trigger_field_names: { type: 'char', help: 'Comma-separated field names (on_change_fields)' },
      filter_pre_domain: { type: 'text', help: 'JSON domain matched before the update' },
      filter_domain: { type: 'text', help: 'JSON domain matched after the change' },
      action: { type: 'char', required: true, string: 'Server Action' },
      date_field: { type: 'char' },
      delay_minutes: { type: 'integer', default: 0 },
      active: { type: 'boolean', default: true },
    },
    constraints: [{ name: 'ir_automation_valid', check: checkAutomationRecords }],
  },
];

export const configAccess: AccessRule[] = [
  { model: 'ir.sequence', group: SYSTEM, perms: all },
  { model: 'ir.sequence.date_range', group: SYSTEM, perms: all },
  { model: 'ir.config_parameter', group: SYSTEM, perms: all },
  { model: 'ir.default', group: 'base.group_user', perms: all },
  { model: 'ir.default', group: SYSTEM, perms: all },
  { model: 'ir.cron', group: SYSTEM, perms: all },
  { model: 'ir.automation', group: SYSTEM, perms: all },
];

export const configRules: RecordRule[] = [
  // users see shared defaults and their own; they may only create/change/delete their own user-scoped ones
  {
    name: 'ir_default_user_read', model: 'ir.default', groups: ['base.group_user'],
    perms: { read: true, write: false, create: false, unlink: false },
    domain: ['|', ['user_id', '=', false], ['user_id', '=', { $ctx: 'uid' } as never]],
  },
  {
    name: 'ir_default_user_own', model: 'ir.default', groups: ['base.group_user'],
    perms: { read: false, write: true, create: true, unlink: true }, domain: [['user_id', '=', { $ctx: 'uid' } as never]],
  },
  { name: 'ir_default_system', model: 'ir.default', groups: [SYSTEM], perms: all, domain: [] },
];
