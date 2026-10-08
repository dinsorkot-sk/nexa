import { describe, expect, it } from 'vitest';
import {
  evaluateFormula,
  evaluateFormulas,
  extractFormulaReferences,
  parseExpression,
} from './index';

describe('formula parser and evaluator', () => {
  it('respects arithmetic precedence and parentheses', () => {
    expect(evaluateFormula(parseExpression('2 + 3 * 4'), {})).toBe(14);
    expect(evaluateFormula(parseExpression('(2 + 3) * 4'), {})).toBe(20);
    expect(evaluateFormula(parseExpression('-4 + 10 / 2'), {})).toBe(1);
  });

  it('evaluates field references and comparisons', () => {
    expect(evaluateFormula(parseExpression('quantity * price'), { quantity: 3, price: 4.5 })).toBe(13.5);
    expect(evaluateFormula(parseExpression('quantity >= 3'), { quantity: 3 })).toBe(true);
    expect(evaluateFormula(parseExpression('enabled == TRUE'), { enabled: true })).toBe(true);
  });

  it('supports the whitelisted functions and strings', () => {
    expect(evaluateFormula(parseExpression('IF(count > 0, ROUND(count / 3, 2), 0)'), { count: 2 })).toBe(0.67);
    expect(evaluateFormula(parseExpression('COALESCE(missing, 7)'), {})).toBe(7);
    expect(evaluateFormula(parseExpression("'Nexa' + ' platform'"), {})).toBe('Nexa platform');
  });

  it('extracts unique field references', () => {
    const ast = parseExpression('IF(total > subtotal, total - subtotal, total)');
    expect(extractFormulaReferences(ast)).toEqual(['total', 'subtotal']);
  });

  it('rejects unsupported syntax and functions', () => {
    expect(() => parseExpression('eval(x)')).toThrow(/Disallowed function/);
    expect(() => parseExpression('x; globalThis.alert(1)')).toThrow(/Unexpected character/);
    expect(() => parseExpression('x ** 2')).toThrow(/Unexpected token/);
    expect(() => parseExpression('1 +')).toThrow(/Unexpected end/);
    expect(() => parseExpression("'unterminated")).toThrow(/Unterminated/);
  });

  it('reports division by zero', () => {
    expect(() => evaluateFormula(parseExpression('10 / divisor'), { divisor: 0 })).toThrow(/Division by zero/);
  });

  it('evaluates formula dependencies in order and reports cycles', () => {
    const fields = [
      { id: 'double', type: 'formula', options: { expression: 'total * 2' } },
      { id: 'total', type: 'computed', options: { expression: 'quantity * price' } },
    ];
    expect(evaluateFormulas(fields, { quantity: 3, price: 5 })).toMatchObject({
      computed: { total: 15, double: 30 }, errors: [],
    });

    const cyclic = evaluateFormulas([
      { id: 'a', type: 'formula', options: { expression: 'b + 1' } },
      { id: 'b', type: 'formula', options: { expression: 'a + 1' } },
    ], {});
    expect(cyclic.computed).toEqual({});
    expect(cyclic.errors).toHaveLength(2);
    expect(cyclic.errors.every((issue) => /Circular reference/.test(issue.message))).toBe(true);
  });
});
