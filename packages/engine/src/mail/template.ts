import { AccessError, ValidationError, type Env } from '../contracts/index.js';
import { evaluateExpression, extractDependencies, parseExpression, type ExprValue } from '../expr/index.js';
import { expressionContext, expressionRecord } from '../orm/compute.js';
import type { EnvImpl } from '../orm/env.js';
import type { RecordsetImpl } from '../orm/recordset.js';
import { assertWritable, positiveInt, requireModel, tenantDriver } from '../services/common.js';
import { createMessage, mailInstalled, readablePartners, resolveSubtype } from './message.js';
import { escapeHtml, sanitizeHtml } from './sanitize.js';

/**
 * Template language (concepts of Odoo inline/QWeb templates, own syntax):
 *   {{ expr }}                 NX-Expr output, HTML-escaped in HTML mode
 *   {{ expr | money(cur) }}    filters: money(currency), date, datetime
 *   {% if expr %} {% elif expr %} {% else %} {% endif %}
 *   {% for name in expr %} ... {% endfor %}
 *   {# comment #}
 * Expressions see the record's fields (bare or as `record.x`), loop variables and the NX-Expr helpers.
 * Record data is loaded through the caller's env (ACL + record rules); there is no raw-output form.
 */

export const TEMPLATE_LIMITS = {
  maxSource: 100_000,
  maxOutput: 500_000,
  maxIterations: 5_000,
  maxDepth: 32,
  maxRecords: 100,
};

type Filter = { name: 'money' | 'date' | 'datetime'; arg: string | null };
type Node =
  | { kind: 'text'; value: string }
  | { kind: 'out'; expr: string; filters: Filter[] }
  | { kind: 'if'; branches: { cond: string; body: Node[] }[]; otherwise: Node[] }
  | { kind: 'for'; name: string; expr: string; body: Node[] };

const LOOP_NAME = /^[a-z_][a-z0-9_]*$/;
const RESERVED = new Set(['record', 'user', 'company', 'companies', 'context', 'today', 'now', 'ref', 'search', 'read_group', 'currency', 'float', 'uom', 'date', 'round', 'abs', 'true', 'false', 'null', 'and', 'or', 'not', 'in']);

function syntax(message: string): never {
  throw new ValidationError(`Template syntax error: ${message}`);
}

function checkExpr(source: string): string {
  const expr = source.trim();
  if (!expr) syntax('empty expression');
  try { parseExpression(expr); } catch (error) { syntax(error instanceof Error ? error.message : 'invalid expression'); }
  return expr;
}

/** Split `expr | f(a) | g` on top-level single pipes (not `||`, not inside strings/brackets). */
function splitPipes(source: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === '|' && depth === 0) {
      if (source[i + 1] === '|') { i++; continue; }
      parts.push(source.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(source.slice(start));
  return parts;
}

function parseOutput(inner: string): Node {
  const [expr, ...rest] = splitPipes(inner);
  const filters = rest.map((raw): Filter => {
    const m = /^\s*([a-z_]+)\s*(?:\(([\s\S]*)\))?\s*$/.exec(raw);
    if (!m || !['money', 'date', 'datetime'].includes(m[1]!)) syntax(`unknown filter '${raw.trim()}'`);
    const name = m[1] as Filter['name'];
    if (name === 'money' && !m[2]?.trim()) syntax('money needs a currency argument');
    if (name !== 'money' && m[2] !== undefined) syntax(`${name} takes no argument`);
    return { name, arg: m[2] !== undefined ? checkExpr(m[2]) : null };
  });
  return { kind: 'out', expr: checkExpr(expr!), filters };
}

/** Parse template source into a tree (throws ValidationError with a syntax message). */
export function parseTemplate(source: string): Node[] {
  if (typeof source !== 'string') syntax('template must be text');
  if (source.length > TEMPLATE_LIMITS.maxSource) syntax('template is too large');
  const root: Node[] = [];
  type Frame = { node: Node | null; body: Node[]; tag: 'root' | 'if' | 'for' };
  const stack: Frame[] = [{ node: null, body: root, tag: 'root' }];
  const top = () => stack[stack.length - 1]!;
  let i = 0;
  while (i < source.length) {
    const next = source.slice(i).search(/\{\{|\{%|\{#/);
    if (next < 0) { top().body.push({ kind: 'text', value: source.slice(i) }); break; }
    if (next > 0) top().body.push({ kind: 'text', value: source.slice(i, i + next) });
    const at = i + next;
    const opener = source.slice(at, at + 2);
    const closer = opener === '{{' ? '}}' : opener === '{%' ? '%}' : '#}';
    const end = source.indexOf(closer, at + 2);
    if (end < 0) syntax(`unclosed '${opener}'`);
    const inner = source.slice(at + 2, end);
    i = end + 2;
    if (opener === '{#') continue;
    if (opener === '{{') { top().body.push(parseOutput(inner)); continue; }
    const m = /^\s*([a-z]+)\b([\s\S]*)$/.exec(inner);
    if (!m) syntax('empty block tag');
    const [, tag, rest] = m as unknown as [string, string, string];
    const frame = top();
    switch (tag) {
      case 'if': {
        if (stack.length > TEMPLATE_LIMITS.maxDepth) syntax('blocks are nested too deeply');
        const node: Node = { kind: 'if', branches: [{ cond: checkExpr(rest), body: [] }], otherwise: [] };
        frame.body.push(node);
        stack.push({ node, body: node.branches[0]!.body, tag: 'if' });
        break;
      }
      case 'elif':
      case 'else': {
        if (frame.tag !== 'if' || frame.node?.kind !== 'if') syntax(`'${tag}' outside of 'if'`);
        const node = frame.node;
        if (frame.body === node.otherwise) syntax(`'${tag}' after 'else'`);
        if (tag === 'elif') {
          const branch = { cond: checkExpr(rest), body: [] as Node[] };
          node.branches.push(branch);
          frame.body = branch.body;
        } else {
          if (rest.trim()) syntax("'else' takes no expression");
          frame.body = node.otherwise;
        }
        break;
      }
      case 'endif':
      case 'endfor':
        if (frame.tag !== (tag === 'endif' ? 'if' : 'for')) syntax(`unexpected '${tag}'`);
        if (rest.trim()) syntax(`'${tag}' takes no expression`);
        stack.pop();
        break;
      case 'for': {
        if (stack.length > TEMPLATE_LIMITS.maxDepth) syntax('blocks are nested too deeply');
        const fm = /^\s*([a-z_][a-z0-9_]*)\s+in\s+([\s\S]+)$/.exec(rest);
        if (!fm) syntax("expected 'for name in expression'");
        if (!LOOP_NAME.test(fm[1]!) || RESERVED.has(fm[1]!)) syntax(`invalid loop variable '${fm[1]}'`);
        const node: Node = { kind: 'for', name: fm[1]!, expr: checkExpr(fm[2]!), body: [] };
        frame.body.push(node);
        stack.push({ node, body: node.body, tag: 'for' });
        break;
      }
      default:
        syntax(`unknown block '${tag}'`);
    }
  }
  if (stack.length > 1) syntax(`unclosed '${top().tag}'`);
  return root;
}

/** Record field paths used by a template (loop variables mapped back to their source path). */
function templatePaths(nodes: Node[], scope: Map<string, string | null>, out: Set<string>, fields: ReadonlySet<string>): void {
  const add = (expr: string) => {
    for (const dep of extractDependencies(expr)) {
      const [head, ...tail] = dep.split('.');
      if (scope.has(head!)) {
        const base = scope.get(head!);
        if (base) out.add(tail.length ? `${base}.${tail.join('.')}` : base);
        continue;
      }
      if (fields.has(head!)) out.add(dep);
      else throw new ValidationError(`Template references unknown field '${head}'`);
    }
  };
  for (const node of nodes) {
    switch (node.kind) {
      case 'text': break;
      case 'out': add(node.expr); for (const f of node.filters) if (f.arg) add(f.arg); break;
      case 'if': for (const b of node.branches) { add(b.cond); templatePaths(b.body, scope, out, fields); } templatePaths(node.otherwise, scope, out, fields); break;
      case 'for': {
        add(node.expr);
        // a loop over a plain field path lets loop-variable paths load through that relation
        const plain = /^(record\.)?([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)*)$/.exec(node.expr.trim());
        let base: string | null = null;
        if (plain) {
          const [head, ...tail] = plain[2]!.split('.');
          if (scope.has(head!)) base = scope.get(head!) ? [scope.get(head!), ...tail].join('.') : null;
          else if (fields.has(head!)) base = plain[2]!;
        }
        const inner = new Map(scope);
        inner.set(node.name, base);
        templatePaths(node.body, inner, out, fields);
        break;
      }
    }
  }
}

/** Evaluate an NX-Expr of a template; any failure becomes a ValidationError. */
function evaluateTemplateExpr(expr: string, scope: Record<string, unknown>): ExprValue {
  try {
    return evaluateExpression(expr, scope);
  } catch (error) {
    throw new ValidationError(`Template expression '${expr.slice(0, 200)}' failed: ${error instanceof Error ? error.message : 'error'}`);
  }
}

function truthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return !!value;
}

function stringify(value: unknown): string {
  if (value === null || value === undefined || value === false) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stringify).join(', ');
  return JSON.stringify(value);
}

interface LangInfo { code: string; dateFormat: string; timeFormat: string; decimalPoint: string; thousandsSep: string }

function strftime(format: string, parts: Record<string, string>): string {
  return format.replace(/%([a-zA-Z%])/g, (m, c: string) => {
    switch (c) {
      case 'Y': return parts.year!;
      case 'y': return parts.year!.slice(2);
      case 'm': return parts.month!;
      case 'd': return parts.day!;
      case 'H': return parts.hour ?? '00';
      case 'I': return String(((Number(parts.hour ?? 0) + 11) % 12) + 1).padStart(2, '0');
      case 'p': return Number(parts.hour ?? 0) < 12 ? 'AM' : 'PM';
      case 'M': return parts.minute ?? '00';
      case 'S': return parts.second ?? '00';
      case '%': return '%';
      default: return m;
    }
  });
}

function groupDigits(int: string, sep: string): string {
  return sep ? int.replace(/\B(?=(\d{3})+(?!\d))/g, sep) : int;
}

/** Render state: one per render() call (shared quotas). */
class Renderer {
  output = 0;
  iterations = 0;
  private currencies = new Map<number, { symbol: string; position: string; places: number }>();

  constructor(private readonly env: Env, private readonly lang: LangInfo, private readonly tz: string, private readonly html: boolean) {}

  private readonly parts: string[] = [];

  /** Render a whole template: one shared buffer, so nested blocks count against the quota once. */
  async run(nodes: Node[], scope: Record<string, unknown>): Promise<string> {
    await this.render(nodes, scope);
    return this.parts.join('');
  }

  private emit(text: string): void {
    this.output += text.length;
    if (this.output > TEMPLATE_LIMITS.maxOutput) throw new ValidationError('Template output quota exceeded');
    this.parts.push(text);
  }

  private async render(nodes: Node[], scope: Record<string, unknown>): Promise<void> {
    const emit = (text: string) => this.emit(text);
    for (const node of nodes) {
      switch (node.kind) {
        case 'text': emit(node.value); break;
        case 'out': {
          let value: unknown = this.evaluate(node.expr, scope);
          let text: string | null = null;
          for (const filter of node.filters) {
            text = await this.applyFilter(filter, value, scope);
            value = text;
          }
          text ??= stringify(value);
          emit(this.html ? escapeHtml(text) : text);
          break;
        }
        case 'if': {
          const branch = node.branches.find((b) => truthy(this.evaluate(b.cond, scope)));
          await this.render(branch ? branch.body : node.otherwise, scope);
          break;
        }
        case 'for': {
          const items = this.evaluate(node.expr, scope);
          if (items === null || items === false) break;
          if (!Array.isArray(items)) throw new ValidationError(`Template loop over '${node.expr}' needs a list`);
          for (const item of items) {
            if (++this.iterations > TEMPLATE_LIMITS.maxIterations) throw new ValidationError('Template loop quota exceeded');
            await this.render(node.body, { ...scope, [node.name]: item });
          }
          break;
        }
      }
    }
  }

  private evaluate(expr: string, scope: Record<string, unknown>): ExprValue {
    return evaluateTemplateExpr(expr, scope);
  }

  private async applyFilter(filter: Filter, value: unknown, scope: Record<string, unknown>): Promise<string> {
    if (value === null || value === undefined || value === false || value === '') return '';
    if (filter.name === 'money') {
      const amount = Number(value);
      if (!Number.isFinite(amount)) throw new ValidationError('money needs a number');
      let currency = this.evaluate(filter.arg!, scope) as unknown;
      if (currency && typeof currency === 'object' && !Array.isArray(currency)) currency = (currency as Record<string, unknown>).id;
      if (typeof currency !== 'number') return this.formatNumber(amount, 2);
      const info = await this.currency(currency);
      const number = this.formatNumber(amount, info.places);
      return info.position === 'after' ? `${number} ${info.symbol}` : `${info.symbol} ${number}`;
    }
    const raw = value instanceof Date ? value : typeof value === 'string' ? value : null;
    if (raw === null) throw new ValidationError(`${filter.name} needs a date`);
    if (filter.name === 'date' && typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
      const [year, month, day] = raw.slice(0, 10).split('-') as [string, string, string];
      return strftime(this.lang.dateFormat, { year, month, day });
    }
    const date = raw instanceof Date ? raw : new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) || raw.length <= 10 ? raw : `${raw.replace(' ', 'T')}Z`);
    if (!Number.isFinite(date.getTime())) throw new ValidationError(`${filter.name} needs a date`);
    let parts: Record<string, string>;
    try {
      parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: this.tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      }).formatToParts(date).map((p) => [p.type, p.value]));
    } catch {
      throw new ValidationError(`Unknown time zone '${this.tz}'`);
    }
    return strftime(filter.name === 'date' ? this.lang.dateFormat : `${this.lang.dateFormat} ${this.lang.timeFormat}`, parts);
  }

  private formatNumber(amount: number, places: number): string {
    const fixed = Math.abs(amount).toFixed(Math.max(0, Math.min(places, 12)));
    const [int, frac] = fixed.split('.');
    return `${amount < 0 && Number(fixed) !== 0 ? '-' : ''}${groupDigits(int!, this.lang.thousandsSep)}${frac ? this.lang.decimalPoint + frac : ''}`;
  }

  private async currency(id: number): Promise<{ symbol: string; position: string; places: number }> {
    const cached = this.currencies.get(id);
    if (cached) return cached;
    // read with the caller's rights (currencies are readable by internal users)
    const [row] = await this.env.withContext({ activeTest: false }).model('res.currency').browse(id).read(['symbol', 'position', 'decimal_places']);
    if (!row) throw new AccessError('Currency is unavailable');
    const info = { symbol: String(row.symbol ?? ''), position: String(row.position ?? 'before'), places: Number(row.decimal_places ?? 2) };
    this.currencies.set(id, info);
    return info;
  }
}

async function langInfo(env: Env, code: string): Promise<LangInfo> {
  const [row] = await env.sudo().withContext({ activeTest: false }).model('res.lang').searchRead(
    [['code', '=', code]], ['code', 'date_format', 'time_format', 'decimal_point', 'thousands_sep'], { limit: 1 },
  );
  if (!row) return { code: 'en_US', dateFormat: '%m/%d/%Y', timeFormat: '%H:%M:%S', decimalPoint: '.', thousandsSep: ',' };
  return {
    code: String(row.code), dateFormat: String(row.date_format), timeFormat: String(row.time_format),
    decimalPoint: String(row.decimal_point ?? '.'), thousandsSep: String(row.thousands_sep ?? ''),
  };
}

export interface InlineTemplate {
  subject?: string | null;
  body_html?: string | null;
  /** NX-Expr giving the recipients' email addresses (text). */
  email_to?: string | null;
  /** NX-Expr giving res.partner id(s): a number, a list, or "1,2". */
  partner_to?: string | null;
  /** NX-Expr giving the language code to render in (e.g. `partner_id.lang`). */
  lang?: string | null;
}

export interface RenderedMail {
  /** subject is PLAIN TEXT (record values are not escaped): escape it when displaying as HTML. */
  res_id: number; subject: string; body_html: string; email_to: string | null; partner_ids: number[]; lang: string;
}

const TEMPLATE_FIELDS = ['subject', 'body_html', 'email_to', 'partner_to', 'lang'] as const;

/** Validate all parts of a template at save time (constraint of mail.template). */
export function validateTemplate(t: InlineTemplate): void {
  if (t.subject) parseTemplate(t.subject);
  if (t.body_html) parseTemplate(t.body_html);
  for (const key of ['email_to', 'partner_to', 'lang'] as const) {
    const source = t[key];
    if (source !== null && source !== undefined && source !== '') checkExpr(source);
  }
}

function partnerIdsOf(value: ExprValue): number[] {
  if (value === null || value === false || value === '') return [];
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',').map((s) => s.trim()).filter(Boolean).map(Number) : [value];
  return list.map((id) => {
    const n = typeof id === 'object' && id !== null && !Array.isArray(id) ? (id as Record<string, ExprValue>).id : id;
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n <= 0) throw new ValidationError('partner_to must give partner ids');
    return n;
  });
}

/**
 * mail.template rendering and sending. Runs as the caller: the template must be readable, the
 * records readable (and writable for send), and every value is loaded with the caller's ACL.
 */
export class MailTemplateService {
  constructor(private readonly env: Env) {}

  async render(template: number | string, ids: number[]): Promise<RenderedMail[]> {
    const { model, source } = await this.load(template);
    return this.renderInline(model, ids, source);
  }

  /** Render caller-supplied template parts (inline templates) for records of `model`. */
  async renderInline(model: string, ids: number[], source: InlineTemplate): Promise<RenderedMail[]> {
    if (!mailInstalled(this.env)) throw new ValidationError('The mail module is not installed');
    requireModel(model);
    const registry = (this.env as EnvImpl).registry;
    if (!registry.models.has(model) || !registry.get(model).table) throw new ValidationError(`Unknown model '${model}'`);
    if (!Array.isArray(ids) || !ids.length || ids.length > TEMPLATE_LIMITS.maxRecords) throw new ValidationError(`Render 1 to ${TEMPLATE_LIMITS.maxRecords} records`);
    const list = [...new Set(ids.map((id) => positiveInt(id, 'record id')))];
    const subject = parseTemplate(source.subject ?? '');
    const body = parseTemplate(source.body_html ?? '');
    const exprs = Object.fromEntries((['email_to', 'partner_to', 'lang'] as const)
      .map((k) => [k, source[k] ? checkExpr(source[k]!) : null])) as Record<'email_to' | 'partner_to' | 'lang', string | null>;
    const fields = new Set(registry.get(model).fields.keys());
    const paths = new Set<string>();
    templatePaths([...subject, ...body], new Map(), paths, fields);
    for (const expr of Object.values(exprs)) if (expr) templatePaths([{ kind: 'out', expr, filters: [] }], new Map(), paths, fields);
    // related records loaded as objects keep their id (e.g. `partner_to: partner_id` next to `partner_id.name`)
    for (const path of [...paths]) {
      const parts = path.split('.');
      for (let i = 1; i < parts.length; i++) paths.add(`${parts.slice(0, i).join('.')}.id`);
    }
    const visible = await this.env.model(model).browse(list).read(['id']);
    if (visible.length !== list.length) throw new AccessError('Record is unavailable');
    const helpers = await expressionContext(this.env as EnvImpl);
    const tz = typeof this.env.context.tz === 'string' && this.env.context.tz ? this.env.context.tz : 'UTC';
    const out: RenderedMail[] = [];
    for (const id of list) {
      const load = async (env: Env) => {
        // JSON round-trip: dates become ISO strings, the only value shapes NX-Expr accepts
        const record = JSON.parse(JSON.stringify(
          await expressionRecord(env.model(model).browse(id) as RecordsetImpl, id, [...paths]),
        )) as Record<string, unknown>;
        return { ...helpers, ...record, record: { id, ...record }, id } as Record<string, unknown>;
      };
      let scope = await load(this.env);
      let code = typeof this.env.context.lang === 'string' && this.env.context.lang ? this.env.context.lang : 'en_US';
      if (exprs.lang) {
        const value = evaluateTemplateExpr(exprs.lang, scope);
        if (typeof value === 'string' && /^[a-z]{2,3}(_[A-Za-z0-9@]+)?$/.test(value) && value !== code) {
          code = value;
          scope = await load(this.env.withContext({ lang: code })); // translated field values
        }
      }
      const lang = await langInfo(this.env, code);
      const text = new Renderer(this.env, lang, tz, false);
      const html = new Renderer(this.env, lang, tz, true);
      const subjectText = (await text.run(subject, scope)).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 1000);
      const bodyHtml = sanitizeHtml(await html.run(body, scope));
      const emailTo = exprs.email_to ? stringify(evaluateTemplateExpr(exprs.email_to, scope)).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 2000) || null : null;
      const partners = exprs.partner_to ? await readablePartners(this.env, partnerIdsOf(evaluateTemplateExpr(exprs.partner_to, scope))) : [];
      out.push({ res_id: id, subject: subjectText, body_html: bodyHtml, email_to: emailTo, partner_ids: partners, lang: lang.code });
    }
    return out;
  }

  /**
   * Render and record the outgoing mail as a message on the document (write access required).
   * No mail server exists yet: nothing is delivered; the message keeps recipients for a future queue.
   */
  async send(template: number | string, resId: number): Promise<number> {
    const { model } = await this.load(template);
    positiveInt(resId, 'record id');
    await assertWritable(this.env, model, resId);
    const [mail] = await this.render(template, [resId]);
    const subtypeId = await resolveSubtype(this.env, 'mail.mt_comment');
    return createMessage(this.env, {
      model, resId, body: mail!.body_html, subject: mail!.subject || null, messageType: 'email', subtypeId,
      partnerIds: mail!.partner_ids, emailTo: mail!.email_to,
    });
  }

  private async load(template: number | string): Promise<{ model: string; source: InlineTemplate }> {
    if (!mailInstalled(this.env)) throw new ValidationError('The mail module is not installed');
    let id: number;
    if (typeof template === 'string') {
      const [module, ...rest] = template.split('.');
      const [row] = await tenantDriver(this.env).query<{ res_id: number | string }>({
        text: `SELECT res_id FROM nx_model_data WHERE module=$1 AND name=$2 AND model='mail.template'`, params: [module, rest.join('.')],
      });
      if (!row) throw new ValidationError(`Unknown template '${template}'`);
      id = Number(row.res_id);
    } else id = positiveInt(template, 'template id');
    const [row] = await this.env.model('mail.template').browse(id).read(['model_name', ...TEMPLATE_FIELDS]);
    if (!row) throw new AccessError('Template is unavailable');
    const source: InlineTemplate = {};
    for (const key of TEMPLATE_FIELDS) source[key] = (row[key] as string | null) ?? null;
    return { model: row.model_name as string, source };
  }
}
