import { describe, expect, it } from 'vitest';
import { createExpressionHelpers, evaluateExpression, extractDependencies, parseExpression, runServerScript, type SafeScriptBridge } from '../src/expr/index.js';
import { PgliteTenantManager } from '../src/tenant/manager.js';
import { ensureSecurityTables, writeModuleSecurity } from '../src/security/tables.js';
import { securityModels } from '../src/security/models.js';
import type { Domain, Env, ModelDef, SearchOptions } from '../src/contracts/index.js';

describe('NX-Expr', () => {
  it('evaluates safe literals, precedence, conditions and null-safe paths', () => {
    expect(evaluateExpression('record.total * 2 + 1', { record: { total: 12 } })).toBe(25);
    expect(evaluateExpression('record.customer.name or "Unknown"', { record: { customer: null } })).toBe('Unknown');
    expect(evaluateExpression('record.state == "open" ? 1 : 0', { record: { state: 'open' } })).toBe(1);
  });

  it('treats quoted punctuation as literal values in lists and concatenation', () => {
    expect(evaluateExpression(`[['label', record.name + '!'], ['punctuation', '['], [',', ']']]`, {
      record: { name: 'Ready' },
    })).toEqual([['label', 'Ready!'], ['punctuation', '['], [',', ']']]);
  });

  it('keeps decimal operations exact through chained calculations', () => {
    expect(evaluateExpression('0.1 + 0.2 + 0.3', {})).toBe(0.6);
    expect(evaluateExpression('0.10000000000001 + 0.00000000000002', {})).toBe(0.10000000000003);
    expect(evaluateExpression('.5 + .5', {})).toBe(1);
    expect(evaluateExpression('"sum=" + (0.1 + 0.2)', {})).toBe('sum=0.3');
    expect(evaluateExpression('[0.1, 0.2, 0.3].sum()', {})).toBe(0.6);
  });

  it('supports bounded collection methods', () => {
    const record = { lines: [{ amount: 3, active: true }, { amount: 4, active: false }] };
    expect(evaluateExpression('record.lines.mapped("amount").sum()', { record })).toBe(7);
    expect(evaluateExpression('record.lines.filtered("active").count()', { record })).toBe(1);
    expect(evaluateExpression('record.lines.any("active")', { record })).toBe(true);
  });

  it('extracts field dependencies and excludes helper roots', () => {
    expect(extractDependencies('record.partner.country_id == company.id and amount > 0')).toEqual(['amount', 'partner.country_id']);
    expect(extractDependencies('record.lines.filtered("active").mapped("amount").sum()')).toEqual(['lines', 'lines.active', 'lines.amount']);
    expect(extractDependencies('record.lines.mapped("partner_id").mapped("name")')).toEqual(['lines', 'lines.partner_id', 'lines.partner_id.name']);
    expect(() => extractDependencies('record.lines.mapped(record.selector)')).toThrow(/literal field selector/);
  });

  it('provides deterministic rounding and date helpers', () => {
    const helpers = createExpressionHelpers();
    expect(evaluateExpression('currency(12.345)', helpers)).toBe(12.35);
    expect(evaluateExpression('uom(1.26, 0.1)', helpers)).toBe(1.3);
    expect(evaluateExpression('date("2026-11-24T19:00:00Z")', helpers)).toBe('2026-11-24');
  });

  it('rejects executable JavaScript and forbidden property access', () => {
    expect(() => evaluateExpression('globalThis.process', {})).toThrow();
    expect(() => evaluateExpression('record.constructor', { record: {} })).toThrow();
    expect(() => evaluateExpression('1; alert(1)', {})).toThrow();
  });

  it('enforces expression size, step and collection quotas', () => {
    expect(() => evaluateExpression('1 + 2', {}, { maxLength: 3 })).toThrow(/size quota/);
    expect(() => evaluateExpression('[1, 2, 3].sum()', {}, { maxCollectionSize: 2 })).toThrow(/collection quota/);
    expect(() => evaluateExpression('1 + 2 + 3', {}, { maxSteps: 2 })).toThrow(/step quota/);
    expect(() => evaluateExpression('((((((((1))))))))', {}, { maxDepth: 4 })).toThrow(/nesting quota/);
    expect(() => parseExpression('1 + 2', { maxTokens: 2 })).toThrow(/token quota/);
    expect(() => evaluateExpression('1e100 ** 100', {})).toThrow(/quota/);
    expect(() => evaluateExpression('record', { record: Array.from({ length: 3 }, (_, i) => i) }, { maxCollectionSize: 2 })).toThrow(/collection quota/);
    expect(() => evaluateExpression('record', { record: { a: 1, b: 2, c: 3 } }, { maxCollectionSize: 2 })).toThrow(/object quota/);
    expect(() => evaluateExpression('record', { record: { a: { b: { c: 1 } } } }, { maxDepth: 2 })).toThrow(/nesting quota/);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => evaluateExpression('record', { record: cyclic }, {})).toThrow(/cyclic/);
    expect(() => evaluateExpression(`[${Array.from({ length: 2_001 }, () => '1').join(',')}]`, {})).toThrow(/quota/);
    const values = { record: { values: [1, 2, 3, 4, 5, 6] } };
    for (const expr of [
      '99 in record.values', 'record.values.sorted()', 'record.values.sum()',
      'record.values.min()', 'record.values.max()',
    ]) expect(() => evaluateExpression(expr, values, { maxSteps: 3 }), expr).toThrow(/step quota/);
    const flags = Array.from({ length: 6 }, () => ({ active: false }));
    expect(() => evaluateExpression('record.values.any("active")', { record: { values: flags } }, { maxSteps: 3 })).toThrow(/step quota/);
    expect(() => evaluateExpression('record.values.all("active")', { record: { values: flags.map(() => ({ active: true })) } }, { maxSteps: 3 })).toThrow(/step quota/);
    expect(() => evaluateExpression('record.values.sum()', { record: { values: '0123456789' } }, { maxCollectionSize: 4 })).toThrow(/collection quota/);
  });

  it('runs scripts in an isolated QuickJS runtime with awaited bridge values', async () => {
    const calls: string[] = [];
    const bridge: SafeScriptBridge = {
      search: async () => { calls.push('search'); return [{ id: 1 }, { id: 2 }]; },
      create: async (_model, values) => { calls.push(`create:${String((values as { name?: string }).name)}`); return { id: 3 }; },
      write: async () => null,
      unlink: async () => null,
      message_post: async () => null,
      call: async (actionId) => ({ value: { action: actionId }, rowsConsumed: 1 }),
      raise: (message) => { throw new Error(message); },
      log: (message) => { calls.push(`log:${message}`); },
    };
    const result = await runServerScript('const rows = env.model("x").search(); const created = env.model("x").create({name: "ok"}); log(rows.length); created.id', bridge, { timeoutMs: 2_000 });
    expect(result).toBe(3);
    expect(calls).toEqual(['search', 'create:ok', 'log:2']);
    await expect(runServerScript('call_action("workflow", {})', bridge, { timeoutMs: 2_000 })).resolves.toEqual({ action: 'workflow' });
  });

  it('enforces QuickJS instruction deadlines and row quotas', async () => {
    let calledLimit = 0;
    let creates = 0;
    const bridge: SafeScriptBridge = {
      search: async (_model, _domain, opts) => { calledLimit = Number((opts as { limit: number }).limit); return [{ id: 1 }]; },
      create: async () => { creates += 1; return null; }, write: async () => null,
      unlink: async () => null, message_post: async () => null, call: async () => ({ value: null, rowsConsumed: 0 }),
      raise: (message) => { throw new Error(message); }, log: () => undefined,
    };
    await expect(runServerScript('while (true) {}', bridge, { timeoutMs: 10 })).rejects.toThrow();
    await expect(runServerScript('env.model("x").search()', bridge, { maxRows: 1 })).resolves.toEqual([{ id: 1 }]);
    expect(calledLimit).toBe(1);
    await expect(runServerScript('env.model("x").create({}); try { env.model("x").create({}); } catch (e) {}', bridge, { maxRows: 1 })).rejects.toThrow(/row quota/);
    expect(creates).toBe(1);
    const badActionBridge: SafeScriptBridge = { ...bridge, call: async () => ({ value: null, rowsConsumed: 2 }) };
    await expect(runServerScript('try { call_action("unbounded", {}); } catch (e) {}', badActionBridge, { maxRows: 1 })).rejects.toThrow(/row quota/);
    await expect(runServerScript('typeof fetch', bridge)).resolves.toBe('undefined');
    const samples: Array<{ phase: string; usedBytes: number; limitBytes: number }> = [];
    await expect(runServerScript('42', bridge, { memoryLimitBytes: 8 * 1024 * 1024, onMemorySample: (sample) => samples.push(sample) })).resolves.toBe(42);
    expect(samples.map((sample) => sample.phase)).toEqual(['initialized', 'completed']);
    expect(samples.every((sample) => sample.usedBytes > 0 && sample.usedBytes < sample.limitBytes)).toBe(true);
    await expect(runServerScript('42', bridge, { maxSourceLength: Number.POSITIVE_INFINITY })).rejects.toThrow(/source limit/);
    let hostWorkSettled = false;
    const cooperativeBridge: SafeScriptBridge = {
      ...bridge,
      search: (_model, _domain, _options, signal) => new Promise((resolve) => {
        signal?.addEventListener('abort', () => { hostWorkSettled = true; resolve([]); }, { once: true });
      }),
    };
    await expect(runServerScript('env.model("x").search()', cooperativeBridge, { timeoutMs: 250 })).rejects.toThrow(/time quota/);
    expect(hostWorkSettled).toBe(true);
  });

  it('propagates authorization failures for the trusted caller to roll back', async () => {
    const bridge: SafeScriptBridge = {
      search: async () => { throw new Error('ACL denied'); }, create: async () => null, write: async () => null,
      unlink: async () => null, message_post: async () => null, call: async () => ({ value: null, rowsConsumed: 0 }),
      raise: (message) => { throw new Error(message); }, log: () => undefined,
    };
    const staged: string[] = [];
    await expect((async () => {
      try { await runServerScript('env.model("secret").search()', bridge); }
      catch (error) { staged.length = 0; throw error; }
    })()).rejects.toThrow('ACL denied');
    expect(staged).toEqual([]);
  });

  it('leaves rollback to the caller transaction after a script failure', async () => {
    const models: ModelDef[] = [
      ...securityModels,
      { name: 'expr.note', origin: 'module', fields: { name: { type: 'char', required: true }, owner_id: { type: 'many2one', comodel: 'res.users' } } },
      { name: 'expr.closed', origin: 'module', fields: { name: { type: 'char' } } },
    ];
    const manager = new PgliteTenantManager({ models: async () => models });
    try {
      const tenant = await manager.open('expr-sandbox');
      await ensureSecurityTables(tenant.driver);
      const root = tenant.env({ uid: 1 });
      const [companyId] = (await root.model('res.company').create({ name: 'Expression Tests' })).ids;
      const [groupId] = (await root.model('res.groups').create({ name: 'User', code: 'base.group_user' })).ids;
      const [aliceId] = (await root.model('res.users').create({ name: 'Alice', login: 'expr-alice', company_id: companyId, group_ids: [groupId] })).ids;
      const [bobId] = (await root.model('res.users').create({ name: 'Bob', login: 'expr-bob', company_id: companyId, group_ids: [groupId] })).ids;
      const alice = tenant.env({ uid: aliceId });
      await writeModuleSecurity(tenant.driver, 'expr-test', [
        { model: 'expr.note', group: 'base.group_user', perms: { read: true, write: true, create: true, unlink: true } },
      ], [
        { name: 'own_notes_only', model: 'expr.note', groups: ['base.group_user'], perms: { read: true, write: true, create: true, unlink: true }, domain: [['owner_id', '=', { $ctx: 'uid' }]] as never },
      ]);
      const [ownId] = (await root.model('expr.note').create({ name: 'original', owner_id: aliceId })).ids;
      const [forbiddenId] = (await root.model('expr.note').create({ name: 'private', owner_id: bobId })).ids;
      const bridgeFor = (callerEnv: Env): SafeScriptBridge => ({
        search: async (model, domain, options) => await callerEnv.model(model).searchRead(
          (domain ?? []) as unknown as Domain,
          ['id', 'name', 'owner_id'], options as unknown as SearchOptions,
        ) as unknown as import('../src/expr/types.js').ExprValue,
        create: async (model, values) => ({ ids: [...(await callerEnv.model(model).create(values as Record<string, unknown>)).ids] }),
        write: async (model, ids, values) => { await callerEnv.model(model).browse(ids as number[]).write(values as Record<string, unknown>); return true; },
        unlink: async (model, ids) => { await callerEnv.model(model).browse(ids as number[]).unlink(); return true; },
        message_post: async () => true,
        call: async () => ({ value: null, rowsConsumed: 0 }),
        raise: (message) => { throw new Error(message); },
        log: () => undefined,
      });
      await alice.transaction(async (transactionEnv) => runServerScript(
        'const mine = env.model("expr.note").search([], {limit: 1}); env.model("expr.note").write(mine.map(row => row.id), {name: "allowed"});',
        bridgeFor(transactionEnv),
        { timeoutMs: 10_000 },
      ));
      expect((await alice.model('expr.note').browse(ownId).read(['name']))[0]?.name).toBe('allowed');

      await expect(alice.transaction(async (transactionEnv) => runServerScript(
        'const mine = env.model("expr.note").search([], {limit: 1}); env.model("expr.note").write(mine.map(row => row.id), {name: "staged"}); env.model("expr.closed").search([]);',
        bridgeFor(transactionEnv),
        { timeoutMs: 10_000 },
      ))).rejects.toThrow(/not allowed/);
      expect((await alice.model('expr.note').browse(ownId).read(['name']))[0]?.name).toBe('allowed');

      await expect(alice.transaction(async (transactionEnv) => runServerScript(
        `const mine = env.model("expr.note").search([], {limit: 1}); env.model("expr.note").write(mine.map(row => row.id), {name: "staged"}); env.model("expr.note").write([${forbiddenId}], {name: "forbidden"});`,
        bridgeFor(transactionEnv),
        { timeoutMs: 10_000 },
      ))).rejects.toThrow(/Record rules forbid write/);
      expect((await alice.model('expr.note').browse(ownId).read(['name']))[0]?.name).toBe('allowed');
    } finally { await manager.closeAll(); }
  }, 60_000);
});
