export type ExprNode =
  | { kind: 'literal'; value: null | boolean | number | string; raw?: string }
  | { kind: 'path'; parts: string[] }
  | { kind: 'array'; values: ExprNode[] }
  | { kind: 'unary'; op: 'not' | '-' | '+'; value: ExprNode }
  | { kind: 'binary'; op: string; left: ExprNode; right: ExprNode }
  | { kind: 'conditional'; test: ExprNode; yes: ExprNode; no: ExprNode }
  | { kind: 'call'; callee: ExprNode; args: ExprNode[] }
  | { kind: 'method'; receiver: ExprNode; name: string; args: ExprNode[] };

type Token = { type: 'number' | 'string' | 'name' | 'op' | 'eof'; value: string; at: number };

const deniedNames = new Set(['__proto__', 'prototype', 'constructor', 'this', 'new', 'function', 'class', 'import', 'globalThis', 'process', 'require']);

function tokenize(source: string, maxTokens: number): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (/\s/.test(ch)) { i += 1; continue; }
    const at = i;
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
      const m = source.slice(i).match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
      if (!m) throw new SyntaxError(`Invalid number at ${i}`);
      i += m[0].length; out.push({ type: 'number', value: m[0], at });
      if (out.length > maxTokens) throw new RangeError('Expression token quota exceeded');
      continue;
    }
    if (ch === '"' || ch === "'") {
      i += 1; let value = '';
      while (i < source.length && source[i] !== ch) {
        if (source[i] === '\\') {
          i += 1;
          const escaped = source[i];
          if (escaped === 'n') value += '\n'; else if (escaped === 'r') value += '\r'; else if (escaped === 't') value += '\t';
          else if (escaped === ch || escaped === '\\') value += escaped;
          else throw new SyntaxError(`Unsupported escape at ${i}`);
          i += 1;
        } else { value += source[i]!; i += 1; }
      }
      if (source[i] !== ch) throw new SyntaxError(`Unterminated string at ${at}`);
      i += 1; out.push({ type: 'string', value, at });
      if (out.length > maxTokens) throw new RangeError('Expression token quota exceeded');
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const m = source.slice(i).match(/^[A-Za-z_$][\w$]*/)!;
      i += m[0].length;
      if (deniedNames.has(m[0])) throw new SyntaxError(`Forbidden identifier '${m[0]}'`);
      out.push({ type: 'name', value: m[0], at });
      if (out.length > maxTokens) throw new RangeError('Expression token quota exceeded');
      continue;
    }
    const op = ['===', '!==', '>=', '<=', '==', '!=', '&&', '||', '**'].find((candidate) => source.startsWith(candidate, i));
    if (op) { out.push({ type: 'op', value: op, at }); i += op.length; }
    else if ('+-*/%><!?:.,()[]'.includes(ch)) { out.push({ type: 'op', value: ch, at }); i += 1; }
    else throw new SyntaxError(`Unexpected character '${ch}' at ${i}`);
    if (out.length > maxTokens) throw new RangeError('Expression token quota exceeded');
  }
  out.push({ type: 'eof', value: '', at: source.length });
  return out;
}

const precedence: Record<string, number> = Object.assign(Object.create(null) as Record<string, number>, {
  or: 1, '||': 1, and: 2, '&&': 2, '==': 3, '===': 3, '!=': 3, '!==': 3, in: 3,
  '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '**': 7,
});

class Parser {
  private cursor = 0;
  private depth = 0;
  constructor(private readonly tokens: Token[], private readonly maxDepth: number) {}
  private peek(): Token { return this.tokens[this.cursor]!; }
  private take(): Token { return this.tokens[this.cursor++]!; }
  private accept(value: string): boolean { if (this.peek().value === value) { this.take(); return true; } return false; }
  private expect(value: string): void { if (!this.accept(value)) throw new SyntaxError(`Expected '${value}' at ${this.peek().at}`); }
  parse(): ExprNode {
    const node = this.expression(0);
    if (this.peek().type !== 'eof') throw new SyntaxError(`Unexpected '${this.peek().value}' at ${this.peek().at}`);
    const stack: Array<{ node: ExprNode; depth: number }> = [{ node, depth: 1 }];
    while (stack.length) {
      const current = stack.pop()!;
      if (current.depth > this.maxDepth) throw new RangeError('Expression nesting quota exceeded');
      const next = current.depth + 1;
      switch (current.node.kind) {
        case 'array': current.node.values.forEach((child) => stack.push({ node: child, depth: next })); break;
        case 'unary': stack.push({ node: current.node.value, depth: next }); break;
        case 'binary': stack.push({ node: current.node.left, depth: next }, { node: current.node.right, depth: next }); break;
        case 'conditional': stack.push({ node: current.node.test, depth: next }, { node: current.node.yes, depth: next }, { node: current.node.no, depth: next }); break;
        case 'call': stack.push({ node: current.node.callee, depth: next }, ...current.node.args.map((child) => ({ node: child, depth: next }))); break;
        case 'method': stack.push({ node: current.node.receiver, depth: next }, ...current.node.args.map((child) => ({ node: child, depth: next }))); break;
        case 'path': case 'literal': break;
      }
    }
    return node;
  }
  private expression(min: number): ExprNode {
    this.depth += 1;
    if (this.depth > this.maxDepth) throw new RangeError('Expression nesting quota exceeded');
    try {
    let left = this.prefix();
    while (true) {
      if (this.accept('.')) {
        const property = this.take();
        if (property.type !== 'name' || deniedNames.has(property.value)) throw new SyntaxError(`Expected safe property at ${property.at}`);
        if (this.accept('(')) {
          const args = this.argumentsAfterOpen();
          left = { kind: 'method', receiver: left, name: property.value, args };
        } else if (left.kind === 'path') left = { kind: 'path', parts: [...left.parts, property.value] };
        else throw new SyntaxError(`Property access is only allowed on named records at ${property.at}`);
        continue;
      }
      if (this.accept('(')) { const args = this.argumentsAfterOpen(); left = { kind: 'call', callee: left, args }; continue; }
      const token = this.peek();
      const op = token.type === 'name' && ['and', 'or', 'in'].includes(token.value)
        ? token.value
        : token.type === 'op' ? token.value : '';
      const p = precedence[op];
      if (p === undefined || p < min) break;
      this.take();
      const right = this.expression(p + (op === '**' ? 0 : 1));
      left = { kind: 'binary', op: op === '&&' ? 'and' : op === '||' ? 'or' : op, left, right };
    }
    if (min === 0 && this.accept('?')) {
      const yes = this.expression(0); this.expect(':'); const no = this.expression(0);
      left = { kind: 'conditional', test: left, yes, no };
    }
    return left;
    } finally { this.depth -= 1; }
  }
  private argumentsAfterOpen(): ExprNode[] {
    const args: ExprNode[] = [];
    if (!this.accept(')')) { do { args.push(this.expression(0)); } while (this.accept(',')); this.expect(')'); }
    return args;
  }
  private prefix(): ExprNode {
    const t = this.take();
    if (t.value === '!' || t.value === 'not' || t.value === '-' || t.value === '+') {
      return { kind: 'unary', op: t.value === '!' ? 'not' : t.value as 'not' | '-' | '+', value: this.expression(8) };
    }
    if (t.value === '(') { const value = this.expression(0); this.expect(')'); return value; }
    if (t.value === '[') { const values: ExprNode[] = []; if (!this.accept(']')) { do { values.push(this.expression(0)); } while (this.accept(',')); this.expect(']'); } return { kind: 'array', values }; }
    if (t.type === 'number') return { kind: 'literal', value: Number(t.value), raw: t.value };
    if (t.type === 'string') return { kind: 'literal', value: t.value };
    if (t.type === 'name') {
      if (t.value === 'true') return { kind: 'literal', value: true };
      if (t.value === 'false') return { kind: 'literal', value: false };
      if (t.value === 'null') return { kind: 'literal', value: null };
      return { kind: 'path', parts: [t.value] };
    }
    throw new SyntaxError(`Unexpected '${t.value}' at ${t.at}`);
  }
}

export function parseExpression(source: string, options: { maxLength?: number; maxTokens?: number; maxDepth?: number } = {}): ExprNode {
  if (typeof source !== 'string' || source.length === 0) throw new SyntaxError('Expression must be a non-empty string');
  const maxLength = Math.min(options.maxLength ?? 10_000, 10_000);
  const maxTokens = Math.min(options.maxTokens ?? 20_000, 20_000);
  const maxDepth = Math.min(options.maxDepth ?? 128, 128);
  if (![maxLength, maxTokens, maxDepth].every((value) => Number.isInteger(value) && value > 0)) throw new RangeError('Expression parser quotas must be positive integers');
  if (source.length > maxLength) throw new RangeError('Expression size quota exceeded');
  return new Parser(tokenize(source, maxTokens), maxDepth).parse();
}
