import { AccessError, EngineError, type AccessOperation, type Domain, type DomainTerm } from '../contracts/index.js';
import type { EnvImpl } from '../orm/env.js';

/**
 * Access control (ADR 0001 §8), evaluated in the engine for every non-superuser env:
 *  1. ACL (nx_access): the operation is allowed on the model if any row whose group is empty or
 *     one of the user's groups grants it. No matching row = denied.
 *  2. Record rules (nx_rule): global rules (no groups) are ANDed; rules of the user's groups are
 *     ORed together; the result is ANDed with the globals. Rules of other groups are ignored.
 *  3. Field groups (FieldDef.groups): fields restricted to groups the user lacks.
 *
 * Rule domains are JSON domains whose values may be placeholders `{ "$ctx": name }` with name one
 * of: uid, company_id, company_ids, group_codes.
 */
export interface UserSecurity {
  uid: number;
  groups: ReadonlySet<string>;
  companyId: number | null;
  companyIds: number[];       // active companies of this env
  allowedCompanyIds: number[];
  acl: Map<string, Promise<Record<AccessOperation, boolean>>>;
  /** all record rules of the tenant, loaded once per env family */
  ruleRows: { model: string; groups: string[]; domain: Domain; perms: Record<AccessOperation, boolean> }[];
  rules: Map<string, Domain | null>;
}

export function userSecurity(env: EnvImpl): Promise<UserSecurity> {
  env.security.promise ??= load(env);
  const p = env.security.promise as Promise<UserSecurity>;
  // do not keep a failed load around (e.g. retry after the user was fixed)
  p.catch(() => { if (env.security.promise === p) env.security.promise = undefined; });
  return p;
}

async function load(env: EnvImpl): Promise<UserSecurity> {
  if (!env.registry.models.has('res.users')) {
    throw new AccessError('Security models are not installed; only superuser environments can run');
  }
  const su = env.sudo();
  const rows = await su.model('res.users').search([['id', '=', env.uid]]);
  if (!rows.ids.length) throw new AccessError(`User ${env.uid} does not exist`);
  const [u] = await rows.read(['active', 'company_id', 'company_ids', 'group_ids']);
  if (!u.active) throw new AccessError(`User ${env.uid} is archived`);

  // group closure over implied_ids
  const groupIds = new Set<number>(u.group_ids as number[]);
  let frontier = [...groupIds];
  while (frontier.length) {
    const implied = (await su.model('res.groups').browse(frontier).read(['implied_ids'])).flatMap((g) => g.implied_ids as number[]);
    frontier = implied.filter((g) => !groupIds.has(g));
    frontier.forEach((g) => groupIds.add(g));
  }
  const codes = groupIds.size
    ? (await su.model('res.groups').browse([...groupIds]).read(['code'])).map((g) => g.code as string)
    : [];

  const companyId = (u.company_id as number | null) ?? null;
  const allowed = [...new Set([...(companyId ? [companyId] : []), ...(u.company_ids as number[])])];
  const requested = env.companyIds.length ? env.companyIds : companyId ? [companyId] : [];
  const bad = requested.filter((c) => !allowed.includes(c));
  if (bad.length) throw new AccessError(`User ${env.uid} may not access companies ${bad.join(', ')}`);

  return {
    uid: env.uid, groups: new Set(codes), companyId, companyIds: requested, allowedCompanyIds: allowed,
    acl: new Map(), rules: new Map(), ruleRows: await loadRules(env),
  };
}

const PERM_COL: Record<AccessOperation, string> = {
  read: 'perm_read', write: 'perm_write', create: 'perm_create', unlink: 'perm_unlink',
};

/** Throw AccessError unless the ACL grants `op` on `model`. No-op for superuser envs. */
export async function checkModelAccess(env: EnvImpl, model: string, op: AccessOperation): Promise<void> {
  if (env.su) return;
  const sec = await userSecurity(env);
  let p = sec.acl.get(model);
  if (!p) {
    p = (async () => {
      const rows = await env.db.query<{ group_code: string | null } & Record<string, boolean>>({
        text: `SELECT group_code, perm_read, perm_write, perm_create, perm_unlink FROM nx_access WHERE model = $1`, params: [model],
      });
      const out = { read: false, write: false, create: false, unlink: false } as Record<AccessOperation, boolean>;
      for (const r of rows) {
        if (r.group_code !== null && !sec.groups.has(r.group_code)) continue;
        for (const o of Object.keys(out) as AccessOperation[]) out[o] ||= !!r[PERM_COL[o]];
      }
      return out;
    })();
    sec.acl.set(model, p);
  }
  if (!(await p)[op]) {
    throw new AccessError(`You are not allowed to ${op} '${model}' records (user ${env.uid})`);
  }
}

async function loadRules(env: EnvImpl): Promise<UserSecurity['ruleRows']> {
  const rows = await env.db.query<{ model: string; groups: string[]; domain: Domain } & Record<string, boolean>>({
    text: `SELECT model, groups, domain, perm_read, perm_write, perm_create, perm_unlink FROM nx_rule ORDER BY id`, params: [],
  });
  return rows.map((r) => ({
    model: r.model, groups: r.groups, domain: r.domain,
    perms: { read: r.perm_read, write: r.perm_write, create: r.perm_create, unlink: r.perm_unlink },
  }));
}

/** Combined record-rule domain for `op` on `model`, or null when no rule applies (sync, after load). */
export function ruleDomainFor(sec: UserSecurity, model: string, op: AccessOperation): Domain | null {
  const key = `${model}:${op}`;
  if (sec.rules.has(key)) return sec.rules.get(key)!;
  const globals: Domain[] = [];
  const grouped: Domain[] = [];
  for (const r of sec.ruleRows) {
    if (r.model !== model || !r.perms[op]) continue;
    const d = substitute(r.domain, sec);
    if (!r.groups.length) globals.push(d);
    else if (r.groups.some((g) => sec.groups.has(g))) grouped.push(d);
  }
  const parts = [...globals];
  if (grouped.length) parts.push(combine('|', grouped));
  const result = parts.length ? combine('&', parts) : null;
  sec.rules.set(key, result);
  return result;
}

/** Combined record-rule domain for `op` on `model`, or null when no rule applies. */
export async function ruleDomain(env: EnvImpl, model: string, op: AccessOperation): Promise<Domain | null> {
  if (env.su) return null;
  return ruleDomainFor(await userSecurity(env), model, op);
}

/** Read-rule lookup for the domain compiler (applied to every traversed comodel), or undefined for superuser. */
export async function readRuleResolver(env: EnvImpl): Promise<((model: string) => Domain | null) | undefined> {
  if (env.su) return undefined;
  const sec = await userSecurity(env);
  return (model) => {
    const rule = ruleDomainFor(sec, model, 'read');
    return env.registry.get(model).def.transient ? combine('&', [rule ?? [], [['create_uid', '=', env.uid]]]) : rule;
  };
}

/** Throw AccessError unless every record in `ids` passes the record rules for `op`. */
export async function checkRecordRules(env: EnvImpl, model: string, ids: readonly number[], op: AccessOperation): Promise<void> {
  if (env.su || ids.length === 0) return;
  if (env.registry.get(model).def.transient) {
    const own = await env.sudo().model(model).searchCount([['id', 'in', [...ids]], ['create_uid', '=', env.uid]]);
    if (own !== new Set(ids).size) throw new AccessError(`Transient records of '${model}' belong to another user`);
  }
  const rule = await ruleDomain(env, model, op);
  if (!rule) return;
  const ok = await env.sudo().withContext({ lang: 'en_US' }).model(model).searchCount(combine('&', [[['id', 'in', [...ids]]], rule]));
  if (ok !== new Set(ids).size) {
    throw new AccessError(`Record rules forbid ${op} on some '${model}' records (user ${env.uid})`);
  }
}

/** Fields the user may not access because of FieldDef.groups. */
export async function hiddenFields(env: EnvImpl, model: string): Promise<Set<string>> {
  const hidden = new Set<string>();
  if (env.su) return hidden;
  const fields = [...env.registry.get(model).fields.values()].filter((f) => f.groups?.length);
  if (!fields.length) return hidden;
  const sec = await userSecurity(env);
  for (const f of fields) if (!f.groups!.some((g) => sec.groups.has(g))) hidden.add(f.name);
  return hidden;
}

/** Combine domains with an n-ary operator in Polish notation. */
export function combine(op: '&' | '|', domains: readonly Domain[]): Domain {
  // an empty domain is TRUE: neutral for '&', absorbing for '|'
  if (op === '|' && domains.some((d) => !d.length)) return [];
  const nonEmpty = domains.filter((d) => d.length);
  if (!nonEmpty.length) return op === '&' ? [] : [['id', '=', 0]];
  const out: DomainTerm[] = [];
  for (let i = 1; i < nonEmpty.length; i++) out.push(op);
  for (const d of nonEmpty) out.push(...normalizeAnd(d));
  return out;
}

/** A domain with implicit top-level AND becomes one explicit expression. */
function normalizeAnd(d: Domain): DomainTerm[] {
  if (!Array.isArray(d)) throw new EngineError('Domain must be an array');
  let count = 0;
  let need = 1;
  for (const t of d) {
    if (need === 0) { count++; need = 1; }
    if (t === '&' || t === '|') need += 1;
    else if (t === '!') need += 0;
    else if (Array.isArray(t) && t.length === 3) need -= 1;
    else throw new EngineError(`Malformed domain term: ${JSON.stringify(t)}`);
  }
  // A dangling operator would otherwise swallow whatever is combined after this domain
  // (e.g. [X, '!'] + rule => X AND NOT rule): reject incomplete domains outright.
  if (need !== 0) throw new EngineError('Malformed domain: operator without operands');
  count++;
  return [...Array<DomainTerm>(count - 1).fill('&'), ...d];
}

function substitute(domain: Domain, sec: UserSecurity): Domain {
  const val = (v: unknown): unknown => {
    if (v && typeof v === 'object' && !Array.isArray(v) && '$ctx' in v) {
      switch ((v as { $ctx: string }).$ctx) {
        case 'uid': return sec.uid;
        case 'company_id': return sec.companyId ?? false;
        case 'company_ids': return sec.companyIds;
        case 'group_codes': return [...sec.groups];
        default: throw new AccessError(`Unknown rule placeholder ${JSON.stringify(v)}`);
      }
    }
    if (Array.isArray(v)) return v.map(val);
    return v;
  };
  return domain.map((t) => (Array.isArray(t) ? [t[0], t[1], val(t[2])] as unknown as DomainTerm : t));
}
