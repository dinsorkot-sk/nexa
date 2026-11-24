import { AccessError, type Domain, type DomainTerm } from '../contracts/index.js';
import { evaluateExpression, parseExpression, type ExprNode } from '../expr/index.js';

interface RuleIdentity {
  uid: number;
  companyId: number | null;
  companyIds: number[];
}

const paths = new Set(['user.id', 'user.company_id', 'company.id', 'companies', 'companyIds', 'context.lang']);
const methods = new Set(['mapped', 'filtered', 'sorted', 'sum', 'min', 'max', 'count', 'any', 'all']);

function validateAst(node: ExprNode): void {
  switch (node.kind) {
    case 'path':
      if (!paths.has(node.parts.join('.'))) throw new TypeError(`Record-rule expression path '${node.parts.join('.')}' is not allowed`);
      return;
    case 'call':
      throw new TypeError('Function calls are not allowed in record-rule expressions');
    case 'method':
      if (!methods.has(node.name)) throw new TypeError(`Collection method '${node.name}' is not allowed in record-rule expressions`);
      validateAst(node.receiver);
      node.args.forEach(validateAst);
      return;
    case 'array': node.values.forEach(validateAst); return;
    case 'unary': validateAst(node.value); return;
    case 'binary': validateAst(node.left); validateAst(node.right); return;
    case 'conditional': validateAst(node.test); validateAst(node.yes); validateAst(node.no); return;
    case 'literal': return;
  }
}

function validateDomain(value: unknown): asserts value is Domain {
  if (!Array.isArray(value)) throw new TypeError('Record-rule expression must return a domain array');
  if (value.length === 0) return; // Empty domains are TRUE, matching legacy JSON rules.
  for (const term of value) {
    if (term === '&' || term === '|' || term === '!') continue;
    if (!Array.isArray(term) || term.length !== 3 || typeof term[0] !== 'string' || typeof term[1] !== 'string') {
      throw new TypeError('Record-rule expression returned a malformed domain');
    }
    if ((term[1] === 'any' || term[1] === 'not any') && !isNestedDomain(term[2])) {
      throw new TypeError(`Record-rule expression returned a malformed '${term[1]}' domain`);
    }
  }
  // Validate Polish notation before it can be combined with other rules.
  let need = 1;
  for (const term of value as DomainTerm[]) {
    if (need === 0) need = 1;
    if (term === '&' || term === '|') need += 1;
    else if (term !== '!') need -= 1;
  }
  if (need !== 0) throw new TypeError('Record-rule expression returned an incomplete domain');
}

function isNestedDomain(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  try { validateDomain(value); return true; }
  catch { return false; }
}

export function validateRuleExpression(source: string): void {
  const ast = parseExpression(source, { maxLength: 2_000, maxTokens: 1_000, maxDepth: 32 });
  validateAst(ast);
}

export function evaluateRuleExpression(source: string, identity: RuleIdentity): Domain {
  try {
    validateRuleExpression(source);
    const value = evaluateExpression(source, {
      user: { id: identity.uid, company_id: identity.companyId ?? false },
      company: { id: identity.companyId ?? false },
      companies: identity.companyIds.map((id) => ({ id })),
      companyIds: [...identity.companyIds],
      context: { lang: 'en_US' },
    }, { maxLength: 2_000, maxTokens: 1_000, maxDepth: 32, maxSteps: 2_000, timeoutMs: 5, maxCollectionSize: 500 });
    validateDomain(value);
    return value;
  } catch (error) {
    throw new AccessError(`Record-rule expression failed closed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
