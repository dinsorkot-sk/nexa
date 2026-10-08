/**
 * Safe sandboxed formula evaluator.
 *
 * Supports arithmetic (`+ - * / %`), comparisons (`== != < > <= >=`),
 * parentheses, and a small whitelist of functions: IF, COALESCE, ROUND.
 * Identifiers resolve to sibling field values in the same record.
 *
 * No `eval`, `Function`, or arbitrary code execution.
 */

// ---------------------------------------------------------------------------
// Tokeniser
// ---------------------------------------------------------------------------

type TokenType =
  | 'NUMBER' | 'STRING' | 'IDENT' | 'PLUS' | 'MINUS'
  | 'STAR' | 'SLASH' | 'PERCENT' | 'LPAREN' | 'RPAREN'
  | 'COMMA' | 'EQ' | 'NEQ' | 'LT' | 'LTE' | 'GT' | 'GTE';

interface Token {
  type: TokenType;
  value: string;
}

const KEYWORDS = new Set(['IF', 'COALESCE', 'ROUND', 'TRUE', 'FALSE']);
const WHITELISTED_CALLS = new Set(['IF', 'COALESCE', 'ROUND']);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < input.length) {
    const ch = input[pos];

    // Skip whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      pos++;
      continue;
    }

    // Two-char operators
    const two = input.slice(pos, pos + 2);
    if (two === '==') { tokens.push({ type: 'EQ', value: two }); pos += 2; continue; }
    if (two === '!=') { tokens.push({ type: 'NEQ', value: two }); pos += 2; continue; }
    if (two === '<=') { tokens.push({ type: 'LTE', value: two }); pos += 2; continue; }
    if (two === '>=') { tokens.push({ type: 'GTE', value: two }); pos += 2; continue; }

    // Single-char operators
    if (ch === '+') { tokens.push({ type: 'PLUS', value: '+' }); pos++; continue; }
    if (ch === '-') { tokens.push({ type: 'MINUS', value: '-' }); pos++; continue; }
    if (ch === '*') { tokens.push({ type: 'STAR', value: '*' }); pos++; continue; }
    if (ch === '/') { tokens.push({ type: 'SLASH', value: '/' }); pos++; continue; }
    if (ch === '%') { tokens.push({ type: 'PERCENT', value: '%' }); pos++; continue; }
    if (ch === '(') { tokens.push({ type: 'LPAREN', value: '(' }); pos++; continue; }
    if (ch === ')') { tokens.push({ type: 'RPAREN', value: ')' }); pos++; continue; }
    if (ch === ',') { tokens.push({ type: 'COMMA', value: ',' }); pos++; continue; }
    if (ch === '<') { tokens.push({ type: 'LT', value: '<' }); pos++; continue; }
    if (ch === '>') { tokens.push({ type: 'GT', value: '>' }); pos++; continue; }

    // Number (digits with at most one dot)
    if (ch >= '0' && ch <= '9') {
      let num = '';
      let dots = 0;
      while (pos < input.length && ((input[pos] >= '0' && input[pos] <= '9') || input[pos] === '.')) {
        if (input[pos] === '.') {
          dots++;
          if (dots > 1) throw new Error(`Malformed number near "${num}."`);
        }
        num += input[pos++];
      }
      tokens.push({ type: 'NUMBER', value: num });
      continue;
    }

    // String literal (single or double quotes, backslash escapes)
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let str = '';
      pos++;
      let closed = false;
      while (pos < input.length) {
        if (input[pos] === '\\' && pos + 1 < input.length) {
          pos++;
          str += input[pos];
          pos++;
          continue;
        }
        if (input[pos] === quote) { closed = true; pos++; break; }
        str += input[pos];
        pos++;
      }
      if (!closed) throw new Error('Unterminated string literal');
      tokens.push({ type: 'STRING', value: str });
      continue;
    }

    // Identifier / keyword (case-insensitive keywords, normalised to UPPER)
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      let id = '';
      while (pos < input.length && /[a-zA-Z0-9_]/.test(input[pos])) {
        id += input[pos++];
      }
      const upper = id.toUpperCase();
      tokens.push({ type: 'IDENT', value: KEYWORDS.has(upper) ? upper : id });
      continue;
    }

    throw new Error(`Unexpected character: ${ch}`);
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Parser — recursive descent.
// Grammar (precedence climbing):
//   expr           → comparison
//   comparison     → addition (('==' | '!=' | '<' | '<=' | '>' | '>=') addition)?
//   addition       → multiplication (('+' | '-') multiplication)*
//   multiplication → unary (('*' | '/' | '%') unary)*
//   unary          → ('-' | '+') unary | primary
//   primary        → NUMBER | STRING | TRUE | FALSE | IDENT
//                 | FUNC '(' args ')' | '(' expr ')'
// ---------------------------------------------------------------------------

export type FormulaAstNode = NumberLit | StringLit | BoolLit | FieldRef | CallExpr | BinaryOp | UnaryOp;

export interface NumberLit { kind: 'number'; value: number; }
export interface StringLit { kind: 'string'; value: string; }
export interface BoolLit { kind: 'bool'; value: boolean; }
export interface FieldRef { kind: 'field'; id: string; }
export interface BinaryOp { kind: 'binary'; op: string; left: FormulaAstNode; right: FormulaAstNode; }
export interface UnaryOp { kind: 'unary'; op: '-'; operand: FormulaAstNode; }
export interface CallExpr { kind: 'call'; name: string; args: FormulaAstNode[]; }

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  parse(): FormulaAstNode {
    const node = this.comparison();
    if (this.peek() !== undefined) {
      throw new Error('Unexpected token after expression');
    }
    return node;
  }

  private peek(): Token | undefined { return this.tokens[this.pos]; }

  private consume(expected?: TokenType): Token {
    const tok = this.peek();
    if (!tok) throw new Error('Unexpected end of expression');
    if (expected && tok.type !== expected) {
      throw new Error(`Expected ${expected}, got ${tok.type}`);
    }
    this.pos++;
    return tok;
  }

  private comparison(): FormulaAstNode {
    const left = this.addition();
    const tok = this.peek();
    if (tok && (tok.type === 'EQ' || tok.type === 'NEQ' || tok.type === 'LT' || tok.type === 'LTE' || tok.type === 'GT' || tok.type === 'GTE')) {
      const op = tok.value;
      this.consume();
      return { kind: 'binary', op, left, right: this.addition() };
    }
    return left;
  }

  private addition(): FormulaAstNode {
    let left = this.multiplication();
    for (;;) {
      const tok = this.peek();
      if (tok?.type === 'PLUS' || tok?.type === 'MINUS') {
        const op = tok.value;
        this.consume();
        left = { kind: 'binary', op, left, right: this.multiplication() };
      } else break;
    }
    return left;
  }

  private multiplication(): FormulaAstNode {
    let left = this.unary();
    for (;;) {
      const tok = this.peek();
      if (tok?.type === 'STAR' || tok?.type === 'SLASH' || tok?.type === 'PERCENT') {
        const op = tok.value;
        this.consume();
        left = { kind: 'binary', op, left, right: this.unary() };
      } else break;
    }
    return left;
  }

  private unary(): FormulaAstNode {
    const tok = this.peek();
    if (tok?.type === 'MINUS') {
      this.consume();
      return { kind: 'unary', op: '-', operand: this.unary() };
    }
    if (tok?.type === 'PLUS') {
      this.consume();
      return this.unary();
    }
    return this.primary();
  }

  private primary(): FormulaAstNode {
    const tok = this.peek();
    if (!tok) throw new Error('Unexpected end of expression');

    if (tok.type === 'LPAREN') {
      this.consume('LPAREN');
      const result = this.comparison();
      this.consume('RPAREN');
      return result;
    }

    if (tok.type === 'NUMBER') {
      this.consume();
      const value = parseFloat(tok.value);
      if (!Number.isFinite(value)) throw new Error(`Invalid number: ${tok.value}`);
      return { kind: 'number', value };
    }

    if (tok.type === 'STRING') {
      this.consume();
      return { kind: 'string', value: tok.value };
    }

    if (tok.value === 'TRUE') { this.consume(); return { kind: 'bool', value: true }; }
    if (tok.value === 'FALSE') { this.consume(); return { kind: 'bool', value: false }; }

    if (tok.type === 'IDENT') {
      const name = tok.value;
      this.consume();
      if (this.peek()?.type === 'LPAREN') {
        this.consume('LPAREN');
        const args: FormulaAstNode[] = [];
        if (this.peek()?.type !== 'RPAREN') {
          args.push(this.comparison());
          while (this.peek()?.type === 'COMMA') {
            this.consume('COMMA');
            args.push(this.comparison());
          }
        }
        this.consume('RPAREN');
        if (!WHITELISTED_CALLS.has(name)) {
          throw new Error(`Disallowed function: ${name}`);
        }
        return { kind: 'call', name, args };
      }
      return { kind: 'field', id: name };
    }

    throw new Error(`Unexpected token: ${tok.type} (${tok.value})`);
  }
}

export function parseExpression(expression: string): FormulaAstNode {
  if (!expression || typeof expression !== 'string' || expression.trim() === '') {
    throw new Error('Expression must be a non-empty string');
  }
  if (expression.length > 10000) throw new Error('Expression is too long');
  const tokens = tokenize(expression);
  if (tokens.length === 0) throw new Error('Empty expression');
  if (tokens.length > 512) throw new Error('Expression is too complex');
  return new Parser(tokens).parse();
}

// ---------------------------------------------------------------------------
// Reference extraction
// ---------------------------------------------------------------------------

export function extractFormulaReferences(ast: FormulaAstNode): string[] {
  const refs: string[] = [];

  function visit(node: FormulaAstNode): void {
    if (node.kind === 'field') {
      if (!refs.includes(node.id)) refs.push(node.id);
    } else if (node.kind === 'binary') {
      visit(node.left);
      visit(node.right);
    } else if (node.kind === 'unary') {
      visit(node.operand);
    } else if (node.kind === 'call') {
      for (const arg of node.args) visit(arg);
    }
  }

  visit(ast);
  return refs;
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

export class FormulaEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaEvaluationError';
  }
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value === true) return 1;
  if (value === false || value === null || value === undefined) return 0;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return 0;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);
  if (typeof value === 'string') return value.length > 0;
  return true;
}

function evalNode(node: FormulaAstNode, fields: Map<string, unknown>): unknown {
  switch (node.kind) {
    case 'number':
    case 'string':
    case 'bool':
      return node.value;
    case 'field': {
      const val = fields.get(node.id);
      // Missing or null reference evaluates to null so COALESCE/IF can handle it.
      return val === undefined ? null : val;
    }
    case 'unary': {
      const operand = evalNode(node.operand, fields);
      if (operand === null) return null;
      const n = toNumber(operand);
      if (Number.isNaN(n)) throw new FormulaEvaluationError('Cannot negate non-numeric value');
      return -n;
    }
    case 'binary': {
      const left = evalNode(node.left, fields);
      const right = evalNode(node.right, fields);
      switch (node.op) {
        case '==':
          if (left === null || right === null) return left === right;
          if (typeof left === 'string' || typeof right === 'string') return String(left) === String(right);
          return toNumber(left) === toNumber(right);
        case '!=':
          if (left === null || right === null) return left !== right;
          if (typeof left === 'string' || typeof right === 'string') return String(left) !== String(right);
          return toNumber(left) !== toNumber(right);
        case '<':
        case '<=':
        case '>':
        case '>=': {
          if (left === null || right === null) return false;
          const l = toNumber(left);
          const r = toNumber(right);
          if (Number.isNaN(l) || Number.isNaN(r)) {
            const ls = String(left);
            const rs = String(right);
            if (node.op === '<') return ls < rs;
            if (node.op === '<=') return ls <= rs;
            if (node.op === '>') return ls > rs;
            return ls >= rs;
          }
          if (node.op === '<') return l < r;
          if (node.op === '<=') return l <= r;
          if (node.op === '>') return l > r;
          return l >= r;
        }
        case '+': {
          if (left === null || right === null) return null;
          if (typeof left === 'string' || typeof right === 'string') {
            const ln = toNumber(left);
            const rn = toNumber(right);
            if (Number.isNaN(ln) || Number.isNaN(rn)) {
              return String(left) + String(right);
            }
            return ln + rn;
          }
          return toNumber(left) + toNumber(right);
        }
        case '-':
          if (left === null || right === null) return null;
          return toNumber(left) - toNumber(right);
        case '*':
          if (left === null || right === null) return null;
          return toNumber(left) * toNumber(right);
        case '/': {
          if (left === null || right === null) return null;
          const divisor = toNumber(right);
          if (divisor === 0) throw new FormulaEvaluationError('Division by zero');
          return toNumber(left) / divisor;
        }
        case '%': {
          if (left === null || right === null) return null;
          const divisor = toNumber(right);
          if (divisor === 0) throw new FormulaEvaluationError('Division by zero');
          return toNumber(left) % divisor;
        }
        default:
          throw new FormulaEvaluationError(`Unknown operator: ${node.op}`);
      }
    }
    case 'call': {
      switch (node.name) {
        case 'IF': {
          if (node.args.length !== 3) throw new FormulaEvaluationError('IF requires exactly 3 arguments');
          return isTruthy(evalNode(node.args[0], fields))
            ? evalNode(node.args[1], fields)
            : evalNode(node.args[2], fields);
        }
        case 'COALESCE': {
          if (node.args.length < 2) throw new FormulaEvaluationError('COALESCE requires at least 2 arguments');
          for (const arg of node.args) {
            const val = evalNode(arg, fields);
            if (val !== null && val !== undefined) return val;
          }
          return null;
        }
        case 'ROUND': {
          if (node.args.length < 1 || node.args.length > 2) throw new FormulaEvaluationError('ROUND requires 1-2 arguments');
          const val = evalNode(node.args[0], fields);
          if (val === null) return null;
          const n = toNumber(val);
          if (Number.isNaN(n)) throw new FormulaEvaluationError('ROUND argument is not a number');
          const decimals = node.args.length === 2 ? Math.trunc(toNumber(evalNode(node.args[1], fields))) : 0;
          const factor = 10 ** Math.min(Math.max(decimals, 0), 12);
          return Math.round(n * factor) / factor;
        }
        default:
          throw new FormulaEvaluationError(`Disallowed function: ${node.name}`);
      }
    }
  }
}

export function evaluateFormula(ast: FormulaAstNode, recordData: Record<string, unknown>): unknown {
  return evalNode(ast, new Map(Object.entries(recordData)));
}

// ---------------------------------------------------------------------------
// Dependency-ordered batch evaluation
// ---------------------------------------------------------------------------
export interface FormulaBatchResult {
  computed: Record<string, unknown>;
  errors: Array<{ fieldId: string; message: string }>;
}

interface FormulaNode {
  id: string;
  ast: FormulaAstNode;
  /** IDs of other formula/computed fields this node depends on. */
  formulaDeps: string[];
}

/**
 * Compute formula/computed values in dependency order.
 *
 * Only formula-to-formula edges constrain ordering; references to ordinary
 * fields always resolve from `inputData` (missing → null). Cyclic
 * formula graphs are reported as errors and left unevaluated.
 */
export function evaluateFormulas(
  fields: Array<{ id: string; type: string; options: { expression?: string } }>,
  inputData: Record<string, unknown>,
): FormulaBatchResult {
  const result: FormulaBatchResult = { computed: {}, errors: [] };
  const formulaIds = new Set(
    fields.filter((f) => f.type === 'formula' || f.type === 'computed').map((f) => f.id),
  );

  const nodes: FormulaNode[] = [];
  for (const field of fields) {
    if (!formulaIds.has(field.id)) continue;
    if (!field.options.expression) continue;
    let ast: FormulaAstNode;
    try {
      ast = parseExpression(field.options.expression);
    } catch (e) {
      result.errors.push({ fieldId: field.id, message: e instanceof Error ? e.message : 'Invalid expression' });
      continue;
    }
    const formulaDeps = extractFormulaReferences(ast).filter((ref) => formulaIds.has(ref));
    nodes.push({ id: field.id, ast, formulaDeps });
  }

  // Kahn's algorithm over formula-to-formula edges only.
  const inDegree = new Map(nodes.map((n) => [n.id, n.formulaDeps.length]));
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  const sorted: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(id);
    for (const node of nodes) {
      if (node.formulaDeps.includes(id)) {
        inDegree.set(node.id, inDegree.get(node.id)! - 1);
        if (inDegree.get(node.id) === 0) queue.push(node.id);
      }
    }
  }

  for (const node of nodes) {
    if (!sorted.includes(node.id)) {
      result.errors.push({ fieldId: node.id, message: 'Circular reference detected' });
    }
  }

  const merged: Record<string, unknown> = { ...inputData };
  for (const id of sorted) {
    const node = nodes.find((n) => n.id === id)!;
    try {
      const value = evaluateFormula(node.ast, merged);
      merged[id] = value;
      result.computed[id] = value;
    } catch (e) {
      result.errors.push({ fieldId: id, message: e instanceof Error ? e.message : 'Evaluation failed' });
      merged[id] = null;
    }
  }

  return result;
}

export const formulaEngineStatus = { status: 'initialized', module: 'formula' };
