export type FilterOp = 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'in';

export interface FilterCondition {
  kind: 'condition';
  field: string;
  op: FilterOp;
  value: unknown;
}

export interface FilterGroup {
  kind: 'group';
  op: 'and' | 'or';
  children: FilterNode[];
}

export type FilterNode = FilterCondition | FilterGroup;

const OP_MAP: Record<string, FilterOp> = {
  '=': 'eq',
  '==': 'eq',
  '!=': 'ne',
  '>': 'gt',
  '<': 'lt',
  '>=': 'gte',
  '<=': 'lte',
};

/** Tokenize a row-filter DSL string. */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '(' || ch === ')') { tokens.push(ch); i++; continue; }
    if (ch === '&' && input[i + 1] === '&') { tokens.push('&&'); i += 2; continue; }
    if (ch === '|' && input[i + 1] === '|') { tokens.push('||'); i += 2; continue; }
    if (ch === '!' && input[i + 1] === '=') { tokens.push('!='); i += 2; continue; }
    if (ch === '>' && input[i + 1] === '=') { tokens.push('>='); i += 2; continue; }
    if (ch === '<' && input[i + 1] === '=') { tokens.push('<='); i += 2; continue; }
    if (ch === '=' || ch === '>' || ch === '<') { tokens.push(ch); i++; continue; }
    // read a word/quoted string
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      let val = '';
      while (j < input.length && input[j] !== quote) { val += input[j]; j++; }
      tokens.push(`'${val}'`);
      i = j + 1;
      continue;
    }
    // read identifier/number/keyword
    let j = i;
    while (j < input.length && !/\s/.test(input[j]) && !'()&|=!><'.includes(input[j])) j++;
    if (j > i) {
      tokens.push(input.slice(i, j));
      i = j;
    } else {
      i++;
    }
  }
  return tokens;
}

/** Recursive descent parser for row-filter DSL. */
export function parseRowFilter(input: string): FilterNode {
  const tokens = tokenize(input);
  let pos = 0;
  function parseOr(): FilterNode {
    let node = parseAnd();
    while (pos < tokens.length && (tokens[pos] === '||' || tokens[pos].toLowerCase() === 'or')) {
      pos++;
      const right = parseAnd();
      node = { kind: 'group', op: 'or', children: [node, right] };
    }
    return node;
  }
  function parseAnd(): FilterNode {
    let node = parsePrimary();
    while (pos < tokens.length && (tokens[pos] === '&&' || tokens[pos].toLowerCase() === 'and')) {
      pos++;
      const right = parsePrimary();
      node = { kind: 'group', op: 'and', children: [node, right] };
    }
    return node;
  }
  function parsePrimary(): FilterNode {
    if (pos >= tokens.length) throw new Error('Unexpected end of filter');
    if (tokens[pos] === '(') {
      pos++;
      const node = parseOr();
      if (tokens[pos] !== ')') throw new Error('Expected )');
      pos++;
      return node;
    }
    // condition: field op value  OR  field contains/in value  OR  field in (...)
    const field = tokens[pos++];
    // check for 'contains'/'in' keywords
    const next = tokens[pos]?.toLowerCase();
    if (next === 'contains') {
      pos++;
      const value = parseValue(tokens[pos++]);
      return { kind: 'condition', field, op: 'contains', value };
    }
    if (next === 'in') {
      pos++;
      // expect ( v1, v2, ... )
      if (tokens[pos] !== '(') throw new Error('Expected ( after in');
      pos++;
      const values: unknown[] = [];
      while (pos < tokens.length && tokens[pos] !== ')') {
        if (tokens[pos] === ',') { pos++; continue; }
        values.push(parseValue(tokens[pos++]));
      }
      if (tokens[pos] !== ')') throw new Error('Expected )');
      pos++;
      return { kind: 'condition', field, op: 'in', value: values };
    }
    // operator
    const opToken = tokens[pos++];
    const op = OP_MAP[opToken];
    if (!op) throw new Error(`Unknown operator: ${opToken}`);
    const value = parseValue(tokens[pos++]);
    return { kind: 'condition', field, op, value };
  }
  function parseValue(tok: string): unknown {
    if (tok === undefined) throw new Error('Expected value');
    if (tok.startsWith("'") && tok.endsWith("'")) return tok.slice(1, -1);
    if (tok.toLowerCase() === 'true') return true;
    if (tok.toLowerCase() === 'false') return false;
    if (tok.toLowerCase() === 'null') return null;
    const num = Number(tok);
    if (!Number.isNaN(num)) return num;
    return tok;
  }
  const result = parseOr();
  if (pos !== tokens.length) throw new Error(`Unexpected token: ${tokens[pos]}`);
  return result;
}