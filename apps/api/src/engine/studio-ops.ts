/**
 * Studio operations shared by the HTTP Studio endpoints and starter packs: request schemas, the
 * protected-model rules and the create operations. Callers must already have checked that the
 * actor is a Settings administrator.
 */
import { isThread, MetadataStore, ValidationError, type Env, type FieldDef, type TenantHandle } from '@nexa/engine';
import { z } from 'zod';

export const modelName = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/).max(120);

export const studioModel = z.object({
  name: z.string().regex(/^x_[a-z0-9_]+$/).max(63),
  description: z.string().max(200).optional(),
});
export const studioExpression = z.string().trim().min(1).max(10_000);
export const studioFieldName = z.string().regex(/^[a-z][a-z0-9_]*$/).max(63);
export const studioExpressions = z.strictObject({
  model: modelName,
  onchange: z.record(studioFieldName, studioExpression).optional(),
  constraints: z.array(z.strictObject({
    name: studioFieldName,
    expression: studioExpression,
    fields: z.array(studioFieldName).max(100).optional(),
    message: z.string().max(200).optional(),
  })).max(100).optional(),
});
export const studioField = z.object({
  model: modelName,
  name: z.string().regex(/^x_[a-z0-9_]+$/).max(63),
  type: z.enum(['char', 'text', 'integer', 'float', 'monetary', 'boolean', 'date', 'datetime', 'selection', 'json', 'many2one', 'one2many', 'many2many', 'reference']),
  label: z.string().max(120).optional(),
  required: z.boolean().optional(),
  translate: z.boolean().optional(),
  // [precision, scale] or the name of a decimal.precision record (checked to exist)
  digits: z.union([
    z.tuple([z.number().int().min(1).max(1000), z.number().int().min(0).max(1000)]),
    z.string().trim().min(1).max(80),
  ]).optional(),
  tracking: z.boolean().optional(),
  copy: z.boolean().optional(),
  aggregator: z.enum(['sum', 'avg', 'min', 'max', 'count', 'count_distinct']).optional(),
  currencyField: z.string().regex(/^[a-z][a-z0-9_]*$/).max(63).optional(),
  computeExpr: studioExpression.optional(),
  defaultExpr: studioExpression.optional(),
  default: z.union([z.string().max(10_000), z.number().finite(), z.boolean()]).optional(),
  help: z.string().max(500).optional(),
  readonly: z.boolean().optional(),
  index: z.boolean().optional(),
  unique: z.boolean().optional(),
  ondelete: z.enum(['cascade', 'set null', 'restrict']).optional(),
  checkCompany: z.boolean().optional(),
  writeGroups: z.array(z.string().min(1).max(200)).max(50).optional(),
  ratchet: z.literal('up').optional(),
  store: z.boolean().optional(),
  depends: z.array(z.string().regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/).max(200)).max(100).optional(),
  comodel: modelName.optional(),
  inverseName: z.string().regex(/^[a-z][a-z0-9_]*$/).max(63).optional(),
  selection: z.array(z.tuple([z.string().min(1).max(40), z.string().min(1).max(80)])).min(1).max(50).optional(),
}).superRefine((field, ctx) => {
  if (['many2one', 'one2many', 'many2many'].includes(field.type) && !field.comodel) {
    ctx.addIssue({ code: 'custom', path: ['comodel'], message: 'Relation fields require a related model.' });
  }
  if (field.type === 'one2many' && !field.inverseName) {
    ctx.addIssue({ code: 'custom', path: ['inverseName'], message: 'One2many fields require the inverse many2one field name.' });
  }
  if (field.type === 'one2many' && (field.store !== undefined || field.computeExpr || field.defaultExpr || field.required || field.depends)) {
    ctx.addIssue({ code: 'custom', path: ['type'], message: 'One2many fields cannot be computed, defaulted, required or set storage.' });
  }
  if (field.type === 'selection' && !field.selection) {
    ctx.addIssue({ code: 'custom', path: ['selection'], message: 'Selection fields require at least one choice.' });
  }
  if (field.digits !== undefined && (field.type !== 'float' || (Array.isArray(field.digits) && field.digits[1] > field.digits[0]))) {
    ctx.addIssue({ code: 'custom', path: ['digits'], message: 'Digits require a float field and scale at most precision.' });
  }
  if (field.translate && field.type !== 'char' && field.type !== 'text') {
    ctx.addIssue({ code: 'custom', path: ['translate'], message: 'Translation requires a text field.' });
  }
  if (field.currencyField && field.type !== 'monetary') {
    ctx.addIssue({ code: 'custom', path: ['currencyField'], message: 'Currency field requires a monetary field.' });
  }
});
export const STUDIO_PROTECTED_MODELS = new Set([
  'res.users', 'res.groups', 'res.company', 'decimal.precision',
  'mail.message', 'mail.tracking.value', 'mail.followers', 'mail.message.subtype',
]);
/**
 * Protected models that still accept plain optional Studio fields (e.g. company lock dates). Mixins,
 * views and field options that change how core code creates or reads these records stay refused.
 */
export const STUDIO_FIELD_ONLY_MODELS = new Set(['res.company']);
export function assertStudioTarget(handle: TenantHandle, model: string, opts: { field?: boolean } = {}): void {
  const target = handle.registry.models.get(model);
  if (!target) throw new ValidationError(`Unknown model '${model}'`);
  const protectedModel = STUDIO_PROTECTED_MODELS.has(model) && !(opts.field && STUDIO_FIELD_ONLY_MODELS.has(model));
  if (target.def.abstract || !target.table || protectedModel || model.startsWith('ir.') || model.startsWith('nx.')) {
    throw new ValidationError(`Studio cannot modify the model '${model}'`);
  }
}

export type StudioModelRequest = z.infer<typeof studioModel>;
export type StudioFieldRequest = z.infer<typeof studioField>;

/** Create a Studio model with its window action, Settings menu and Settings-only access. */
export async function createStudioModel(handle: TenantHandle, req: StudioModelRequest): Promise<{ model: string }> {
  const key = req.name;
  try {
    await MetadataStore.for(handle).createModel(
      { name: req.name, ...(req.description ? { description: req.description } : {}) },
      async (tx) => {
    await tx.query({
      text: `INSERT INTO nx_action (module, xml_id, type, name, model, view_types) VALUES ('studio', $1, 'window', $2, $3, ARRAY['list','form'])`,
      params: [`studio.action_${key}`, req.description || req.name, req.name],
    });
    await tx.query({
      text: `INSERT INTO nx_menu (module, xml_id, name, parent, action, sequence, groups) VALUES ('studio', $1, $2, 'base.menu_settings', $3, 50, ARRAY['base.group_system'])`,
      params: [`studio.menu_${key}`, req.description || req.name, `studio.action_${key}`],
    });
    await tx.query({
      text: `INSERT INTO nx_access (module, model, group_code, perm_read, perm_write, perm_create, perm_unlink) VALUES ('studio', $1, 'base.group_system', true, true, true, true)`,
      params: [req.name],
    });
      },
    );
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === '23505') {
      throw new ValidationError(`Model '${req.name}' or its Studio identifiers already exist`);
    }
    throw err;
  }
  return { model: req.name };
}

/** Add a Studio field after the Studio target, option and relation checks. */
export async function createStudioField(env: Env, handle: TenantHandle, req: StudioFieldRequest): Promise<{ model: string; field: string }> {
  assertStudioTarget(handle, req.model, { field: true });
  if (STUDIO_FIELD_ONLY_MODELS.has(req.model)
    && (req.required || req.unique || req.computeExpr || req.defaultExpr || req.checkCompany || req.ondelete === 'restrict'
      || req.type === 'one2many' || req.type === 'many2many')) {
    // core code creates companies without knowing these fields; computed or relational lists would run on every
    // company read; checkCompany has no owning company_id here; restrict would block deleting the referenced records.
    // Every internal user can read res.company, so these fields must not hold secrets.
    throw new ValidationError(`Studio fields on '${req.model}' must be optional, non-unique, non-computed, without checkCompany or ondelete 'restrict', and not one2many/many2many`);
  }
  if (req.tracking && !isThread(env, req.model)) {
    throw new ValidationError(`Tracking requires '${req.model}' to inherit mail.thread`);
  }
  if (typeof req.digits === 'string') {
    const count = await env.model('decimal.precision').searchCount([['name', '=', req.digits]]);
    if (!count) throw new ValidationError(`Unknown decimal precision '${req.digits}'`);
  }
  if (req.type === 'one2many') {
    // the comodel must be a concrete model with a stored many2one back to this model
    const comodel = handle.registry.models.get(req.comodel!);
    if (!comodel || comodel.def.abstract) throw new ValidationError(`Unknown related model '${req.comodel}'`);
    const inverse = comodel.fields.get(req.inverseName!);
    if (!inverse || inverse.type !== 'many2one' || inverse.comodel !== req.model || inverse.store === false
      || inverse.compute || inverse.computeExpr || inverse.related) {
      throw new ValidationError(`'${req.comodel}.${req.inverseName}' must be a stored many2one field to '${req.model}'`);
    }
  }
  const field: FieldDef = {
    type: req.type,
    ...(req.label ? { string: req.label } : {}),
    ...(req.required ? { required: true } : {}),
    ...(req.translate !== undefined ? { translate: req.translate } : {}),
    ...(req.digits !== undefined ? { digits: req.digits } : {}),
    ...(req.tracking !== undefined ? { tracking: req.tracking } : {}),
    // a unique value is never duplicated by copy() unless asked (the engine refuses copy: true with unique)
    ...(req.copy !== undefined ? { copy: req.copy } : req.unique ? { copy: false } : {}),
    ...(req.aggregator ? { aggregator: req.aggregator } : {}),
    ...(req.currencyField ? { currencyField: req.currencyField } : {}),
    ...(req.computeExpr ? { computeExpr: req.computeExpr } : {}),
    ...(req.defaultExpr ? { defaultExpr: req.defaultExpr } : {}),
    ...(req.default !== undefined ? { default: req.default } : {}),
    ...(req.help ? { help: req.help } : {}),
    ...(req.readonly !== undefined ? { readonly: req.readonly } : {}),
    ...(req.index !== undefined ? { index: req.index } : {}),
    ...(req.unique ? { unique: true } : {}),
    ...(req.ondelete ? { ondelete: req.ondelete } : {}),
    ...(req.checkCompany !== undefined ? { checkCompany: req.checkCompany } : {}),
    ...(req.writeGroups ? { writeGroups: req.writeGroups } : {}),
    ...(req.ratchet ? { ratchet: req.ratchet } : {}),
    ...(req.store !== undefined ? { store: req.store } : {}),
    ...(req.depends ? { depends: req.depends } : {}),
    ...(req.comodel ? { comodel: req.comodel } : {}),
    ...(req.inverseName ? { inverseName: req.inverseName } : {}),
    ...(req.selection ? { selection: req.selection } : {}),
  };
  try {
    await MetadataStore.for(handle).addField(req.model, req.name, field);
  } catch (err) {
    // defensive: a raw unique violation while building the index is a validation error, not a 500.
    // A stored-compute backfill collision is already a ValidationError ("Duplicate value…") from the ORM.
    if (req.unique && typeof err === 'object' && err !== null && 'code' in err && err.code === '23505') {
      throw new ValidationError(`Field '${req.model}.${req.name}' cannot be unique: existing records share a value`);
    }
    throw err;
  }
  return { model: req.model, field: req.name };
}
