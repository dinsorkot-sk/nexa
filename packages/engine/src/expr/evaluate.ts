import type { ExprEnvironment, ExprOptions, ExprValue } from './types.js';
import type { ExprNode } from './parser.js';

const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const builtins = new Set(['user', 'company', 'companies', 'context', 'today', 'now', 'ref', 'search', 'read_group', 'currency', 'float', 'uom', 'date', 'round', 'abs']);
const decimalTag = Symbol('nx-decimal');
type Decimal = { [decimalTag]: true; coefficient: bigint; scale: number };
type Internal = ExprValue | Decimal | Internal[] | Record<string, unknown> | ((...args: ExprValue[]) => ExprValue) | undefined;

function decimal(value: number | string): Decimal {
  const text = String(value);
  if (!Number.isFinite(Number(text))) throw new TypeError('Expected a finite number');
  const match = text.match(/^(-?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if (!match) throw new TypeError('Invalid decimal');
  const sign = match[1] === '-' ? -1n : 1n;
  const fraction = match[3] ?? '';
  const exponent = Number(match[4] ?? 0);
  if (Math.abs(exponent) > 100 || fraction.length > 100) throw new RangeError('Decimal scale quota exceeded');
  const digits = `${match[2] || '0'}${fraction}`;
  if (digits.length > 100) throw new RangeError('Decimal precision quota exceeded');
  let coefficient = sign * BigInt(digits);
  let scale = fraction.length - exponent;
  if (scale < 0) { coefficient *= 10n ** BigInt(-scale); scale = 0; }
  return bounded(coefficient, scale);
}
function isDecimal(v: Internal): v is Decimal { return typeof v === 'object' && v !== null && decimalTag in v; }
function align(a: Decimal, b: Decimal): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale);
  return [a.coefficient * 10n ** BigInt(scale - a.scale), b.coefficient * 10n ** BigInt(scale - b.scale), scale];
}
function norm(coefficient: bigint, scale: number): Decimal {
  while (scale > 0 && coefficient % 10n === 0n) { coefficient /= 10n; scale -= 1; }
  return bounded(coefficient, scale);
}
function bounded(coefficient: bigint, scale: number): Decimal {
  if (scale < 0 || scale > 100 || coefficient.toString().replace('-', '').length > 128) throw new RangeError('Decimal arithmetic quota exceeded');
  return { [decimalTag]: true, coefficient, scale };
}
function decimalText(value: Decimal): string {
  const negative = value.coefficient < 0n;
  const digits = (negative ? -value.coefficient : value.coefficient).toString().padStart(value.scale + 1, '0');
  const whole = value.scale === 0 ? digits : digits.slice(0, -value.scale);
  const fraction = value.scale === 0 ? '' : `.${digits.slice(-value.scale)}`;
  return `${negative ? '-' : ''}${whole}${fraction}`;
}
function internalString(value: Internal): string { return isDecimal(value) ? decimalText(value) : String(value); }
function dOp(op: string, left: Internal, right: Internal): Decimal {
  const a = isDecimal(left) ? left : decimal(left as number);
  const b = isDecimal(right) ? right : decimal(right as number);
  if (op === '+' || op === '-') { const [x, y, s] = align(a, b); return norm(op === '+' ? x + y : x - y, s); }
  if (op === '*') return norm(a.coefficient * b.coefficient, a.scale + b.scale);
  if (op === '/') {
    if (b.coefficient === 0n) throw new RangeError('Division by zero');
    const scale = 12;
    const numerator = a.coefficient * 10n ** BigInt(scale + b.scale);
    const denominator = b.coefficient * 10n ** BigInt(a.scale);
    return norm(numerator / denominator, scale);
  }
  if (op === '%') { const [x, y, s] = align(a, b); if (y === 0n) throw new RangeError('Division by zero'); return norm(x % y, s); }
  if (op === '**') {
    const exponent = Number(b.coefficient) / 10 ** b.scale;
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 100) throw new RangeError('Exponent must be an integer between -100 and 100');
    if (exponent < 0) return dOp('/', decimal(1), dOp('**', a, decimal(-exponent)));
    if (a.scale * exponent > 100 || a.coefficient.toString().replace('-', '').length * exponent > 128) throw new RangeError('Decimal arithmetic quota exceeded');
    return norm(a.coefficient ** BigInt(exponent), a.scale * exponent);
  }
  throw new TypeError(`Unsupported numeric operator '${op}'`);
}
function asNumber(v: Internal): number { return isDecimal(v) ? Number(v.coefficient) / 10 ** v.scale : Number(v); }
function truthy(v: Internal): boolean { return isDecimal(v) ? v.coefficient !== 0n : Boolean(v); }
function safeProperty(value: Internal, key: string): Internal {
  if (forbidden.has(key)) throw new TypeError(`Forbidden property '${key}'`);
  if (value === null || value === undefined) return null;
  if (Array.isArray(value) && key === 'length') return value.length;
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError('Expression values must be plain data objects');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) return null;
    if (!('value' in descriptor)) throw new TypeError('Expression values cannot contain accessors');
    return descriptor.value as Internal ?? null;
  }
  return null;
}
function output(v: Internal, tick: (count?: number) => void, maxCollectionSize: number, maxDepth: number, depth = 0, seen = new Set<object>()): ExprValue {
  if (isDecimal(v)) return asNumber(v);
  if (depth > maxDepth) throw new RangeError('Expression nesting quota exceeded');
  if (Array.isArray(v)) {
    if (v.length > maxCollectionSize) throw new RangeError('Expression collection quota exceeded');
    if (seen.has(v)) throw new TypeError('Expression values cannot be cyclic');
    seen.add(v);
    const result: ExprValue[] = [];
    for (let i = 0; i < v.length; i += 1) {
      tick();
      const descriptor = Object.getOwnPropertyDescriptor(v, String(i));
      if (descriptor && !('value' in descriptor)) throw new TypeError('Expression values cannot contain accessors');
      result.push(descriptor ? output(descriptor.value as Internal, tick, maxCollectionSize, maxDepth, depth + 1, seen) : null);
    }
    seen.delete(v);
    return result;
  }
  if (v !== null && typeof v === 'object') {
    const prototype = Object.getPrototypeOf(v);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError('Expression values must be plain data objects');
    if (seen.has(v)) throw new TypeError('Expression values cannot be cyclic');
    seen.add(v);
    const record: Record<string, ExprValue> = {};
    let entries = 0;
    for (const key of Object.keys(v)) {
      entries += 1;
      if (entries > maxCollectionSize) throw new RangeError('Expression object quota exceeded');
      tick();
      const descriptor = Object.getOwnPropertyDescriptor(v, key)!;
      if (!('value' in descriptor)) throw new TypeError('Expression values cannot contain accessors');
      const item = descriptor.value as Internal;
      if (item !== undefined && typeof item !== 'function') record[key] = output(item, tick, maxCollectionSize, maxDepth, depth + 1, seen);
    }
    seen.delete(v);
    return record;
  }
  return v as ExprValue;
}

export function evaluateAst(ast: ExprNode, environment: ExprEnvironment, options: ExprOptions = {}): ExprValue {
  const maxSteps = Math.min(options.maxSteps ?? 20_000, 100_000);
  const timeoutMs = Math.min(options.timeoutMs ?? 25, 1_000);
  const maxCollectionSize = Math.min(options.maxCollectionSize ?? 2_000, 2_000);
  const maxDepth = Math.min(options.maxDepth ?? 128, 128);
  if (![maxSteps, timeoutMs, maxCollectionSize, maxDepth].every((value) => Number.isFinite(value) && value > 0)) throw new RangeError('Expression runtime quotas must be positive finite values');
  const deadline = Date.now() + timeoutMs;
  let steps = 0;
  const tick = (count = 1): void => { steps += count; if (steps > maxSteps) throw new RangeError('Expression step quota exceeded'); if (Date.now() > deadline) throw new RangeError('Expression time quota exceeded'); };
  const visit = (node: ExprNode): Internal => {
    tick();
    switch (node.kind) {
      case 'literal': return typeof node.value === 'number' && node.raw !== undefined ? decimal(node.raw) : node.value;
      case 'array': {
        if (node.values.length > maxCollectionSize) throw new RangeError('Expression collection quota exceeded');
        return node.values.map(visit);
      }
      case 'path': {
        let value: Internal = environment;
        for (const part of node.parts) value = safeProperty(value, part);
        return value;
      }
      case 'unary': {
        const v = visit(node.value);
        if (node.op === 'not') return !truthy(v);
        if (typeof v !== 'number' && !isDecimal(v)) throw new TypeError('Unary arithmetic requires a number');
        return node.op === '-' ? dOp('*', v, decimal(-1)) : v;
      }
      case 'conditional': return truthy(visit(node.test)) ? visit(node.yes) : visit(node.no);
      case 'binary': {
        const left = visit(node.left);
        if (node.op === 'and') return truthy(left) ? visit(node.right) : left;
        if (node.op === 'or') return truthy(left) ? left : visit(node.right);
        const right = visit(node.right);
        if (['+', '-', '*', '/', '%', '**'].includes(node.op)) {
          if (node.op === '+' && (typeof left === 'string' || typeof right === 'string')) return internalString(left) + internalString(right);
          if ((typeof left !== 'number' && !isDecimal(left)) || (typeof right !== 'number' && !isDecimal(right))) throw new TypeError(`Operator '${node.op}' requires numbers`);
          return dOp(node.op, left, right);
        }
        if (node.op === 'in') {
          if (Array.isArray(right)) {
            if (right.length > maxCollectionSize) throw new RangeError('Expression collection quota exceeded');
            for (const item of right) { tick(); if (equal(left, item)) return true; }
            return false;
          }
          if (typeof right === 'string') {
            if (right.length > 10_000 || internalString(left).length > 10_000) throw new RangeError('Expression string quota exceeded');
            tick(right.length + 1);
            return right.includes(internalString(left));
          }
          return false;
        }
        if (node.op === '==' || node.op === '===') return equal(left, right);
        if (node.op === '!=' || node.op === '!==') return !equal(left, right);
        const order = compare(left, right, tick);
        if (node.op === '<') return order < 0;
        if (node.op === '<=') return order <= 0;
        if (node.op === '>') return order > 0;
        if (node.op === '>=') return order >= 0;
        throw new TypeError(`Unsupported operator '${node.op}'`);
      }
      case 'call': {
        const args = node.args.map(visit);
        const path = node.callee.kind === 'path' ? node.callee.parts : [];
        const memberIndex = path.findIndex((x) => x.startsWith('\0'));
        if (memberIndex >= 0) {
          const receiverPath = path.slice(0, memberIndex);
          let receiver: Internal = environment;
          for (const part of receiverPath) receiver = safeProperty(receiver, part);
          return collectionCall(receiver, path[memberIndex]!.slice(1), args, maxCollectionSize, tick);
        }
        const name = path.length === 1 ? path[0]! : '';
        if (!builtins.has(name)) throw new TypeError(`Call to '${name || 'expression'}' is not allowed`);
        const fn = safeProperty(environment, name);
        if (typeof fn !== 'function') throw new TypeError(`Helper '${name}' is not available`);
        return fn(...args.map((arg) => output(arg, tick, maxCollectionSize, maxDepth)));
      }
      case 'method': return collectionCall(visit(node.receiver), node.name, node.args.map(visit), maxCollectionSize, tick);
    }
  };
  return output(visit(ast), tick, maxCollectionSize, maxDepth);
}

function equal(a: Internal, b: Internal): boolean {
  if ((typeof a === 'number' || isDecimal(a)) && (typeof b === 'number' || isDecimal(b))) {
    const [x, y] = align(isDecimal(a) ? a : decimal(a), isDecimal(b) ? b : decimal(b));
    return x === y;
  }
  return a === b;
}
function compare(a: Internal, b: Internal, tick: (count?: number) => void): number {
  tick();
  if ((typeof a === 'number' || isDecimal(a)) && (typeof b === 'number' || isDecimal(b))) {
    const [x, y] = align(isDecimal(a) ? a : decimal(a), isDecimal(b) ? b : decimal(b));
    return x < y ? -1 : x > y ? 1 : 0;
  }
  const x = String(a ?? ''); const y = String(b ?? '');
  if (x.length > 10_000 || y.length > 10_000) throw new RangeError('Expression string quota exceeded');
  tick(Math.max(x.length, y.length, 1));
  return x < y ? -1 : x > y ? 1 : 0;
}
function collectionCall(receiver: Internal, method: string, args: Internal[], max: number, tick: (count?: number) => void): Internal {
  if (!Array.isArray(receiver) && typeof receiver !== 'string') throw new TypeError(`Collection method '${method}' requires an array or string`);
  if (receiver.length > max) throw new RangeError('Expression collection quota exceeded');
  const list = typeof receiver === 'string' ? [...receiver] : receiver;
  const field = typeof args[0] === 'string' ? args[0] : undefined;
  const read = (item: Internal): Internal => field ? safeProperty(item, field) : item;
  switch (method) {
    case 'mapped': return list.map((x) => { tick(); return read(x); });
    case 'filtered': return list.filter((x) => { tick(); return field ? truthy(read(x)) : truthy(x); });
    case 'sorted': return [...list].sort((a, b) => compare(read(a), read(b), tick));
    case 'sum': return list.reduce<Internal>((total, item) => { tick(); return dOp('+', total, read(item)); }, decimal(0));
    case 'min': case 'max': {
      if (list.length === 0) return null;
      let best = read(list[0]!);
      for (let i = 1; i < list.length; i += 1) {
        tick();
        const item = read(list[i]!);
        if (method === 'min' ? compare(item, best, tick) < 0 : compare(item, best, tick) > 0) best = item;
      }
      return best;
    }
    case 'count': return list.length;
    case 'any': { for (const x of list) { tick(); if (truthy(field ? read(x) : x)) return true; } return false; }
    case 'all': { for (const x of list) { tick(); if (!truthy(field ? read(x) : x)) return false; } return true; }
    default: throw new TypeError(`Collection method '${method}' is not allowed`);
  }
}
