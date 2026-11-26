import type { Env, ModelDef } from '../src/index.js';

export const matchingModels: ModelDef[] = [
  { name: 'mt.parent', origin: 'module', fields: { name: { type: 'char' } } },
  { name: 'mt.line', origin: 'module', fields: {
    state: { type: 'selection', selection: [['locked', 'Locked']], default: 'locked' },
    parent_id: { type: 'many2one', comodel: 'mt.parent', ondelete: 'restrict' },
    bucket: { type: 'char' }, eligible: { type: 'boolean', default: true }, date: { type: 'date' },
    amount: { type: 'float' }, residual: { type: 'float' }, secondary: { type: 'float' }, secondary_residual: { type: 'float' }, spare_residual: { type: 'float' },
    full_id: { type: 'many2one', comodel: 'mt.full', ondelete: 'restrict' },
  } },
  { name: 'mt.link', origin: 'module', fields: {
    state: { type: 'selection', selection: [['locked', 'Locked']], default: 'locked' },
    positive_id: { type: 'many2one', comodel: 'mt.line', required: true, ondelete: 'restrict' },
    negative_id: { type: 'many2one', comodel: 'mt.line', required: true, ondelete: 'restrict' },
    amount: { type: 'float', required: true }, positive_secondary: { type: 'float' }, negative_secondary: { type: 'float' },
  } },
  { name: 'mt.full', origin: 'module', fields: { state: { type: 'selection', selection: [['locked', 'Locked']], default: 'locked' } } },
];
matchingModels.push({ ...matchingModels.find((m) => m.name === 'mt.link')!, name: 'mt.otherlink' });
matchingModels.push({ ...matchingModels.find((m) => m.name === 'mt.link')!, name: 'mt.thirdlink' });
export const matchingAccess = matchingModels.map((m) => ({ model: m.name, group: 'base.group_user', perms: { read: true, write: true, create: true, unlink: true } }));
export const matchingRule = {
  model: 'mt.line', key: 'settle', eligible: 'eligible', group_by: ['bucket'], amount_field: 'amount', residual_field: 'residual',
  secondary_amount_field: 'secondary', secondary_residual_field: 'secondary_residual', rounding: 0.01, secondary_rounding: 0.01,
  lock_parents: ['parent_id'], full: { model: 'mt.full', field: 'full_id' },
  link: { model: 'mt.link', positive_field: 'positive_id', negative_field: 'negative_id', amount_field: 'amount', positive_secondary_field: 'positive_secondary', negative_secondary_field: 'negative_secondary' },
};
export async function setupMatching(env: Env): Promise<void> {
  await env.model('ir.lifecycle').create({ model: 'mt.line', state_field: 'state', initial_state: 'locked', locks: [{ states: ['locked'], writable: [], unlink: false }], engine_fields: ['residual', 'secondary_residual', 'spare_residual', 'full_id'] });
  for (const model of ['mt.link', 'mt.otherlink', 'mt.thirdlink']) await env.model('ir.lifecycle').create({ model, state_field: 'state', initial_state: 'locked', locks: [{ states: ['locked'], writable: [], unlink: false }], engine_fields: ['positive_id', 'negative_id', 'amount', 'positive_secondary', 'negative_secondary'] });
  await env.model('ir.lifecycle').create({ model: 'mt.full', state_field: 'state', initial_state: 'locked', locks: [{ states: ['locked'], writable: [], unlink: false }] });
  await env.model('ir.match.rule').create(matchingRule);
}
export async function line(env: Env, amount: number, vals: Record<string, unknown> = {}): Promise<number> {
  return (await env.model('mt.line').create({ bucket: 'A', amount, secondary: amount * 2, ...vals })).ids[0]!;
}
