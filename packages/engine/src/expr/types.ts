export type ExprValue = null | boolean | number | string | ExprValue[] | { [key: string]: ExprValue };

export interface ExprHelpers {
  user?: ExprValue;
  company?: ExprValue;
  companies?: ExprValue;
  context?: ExprValue;
  today?: string;
  now?: string;
  ref?: (xmlId: string) => ExprValue;
  search?: (...args: ExprValue[]) => ExprValue;
  read_group?: (...args: ExprValue[]) => ExprValue;
  currency?: (...args: ExprValue[]) => ExprValue;
  float?: (...args: ExprValue[]) => ExprValue;
  uom?: (...args: ExprValue[]) => ExprValue;
  date?: (...args: ExprValue[]) => ExprValue;
}

export interface ExprOptions {
  /** Maximum expression length. Defaults to 10,000 UTF-16 code units. */
  maxLength?: number;
  /** Maximum parser/evaluator operations. Defaults to 20,000. */
  maxSteps?: number;
  /** Wall clock budget in milliseconds. Defaults to 25ms. */
  timeoutMs?: number;
  /** Maximum collection elements visited or produced. Defaults to 2,000. */
  maxCollectionSize?: number;
  /** Maximum lexer tokens. Defaults to 20,000. */
  maxTokens?: number;
  /** Maximum expression nesting. Defaults to 128. */
  maxDepth?: number;
  /**
   * Extra helper names callable in this evaluation (besides built-in and registered helpers).
   * The function itself is supplied through the environment under the same name.
   */
  helpers?: readonly string[];
}

/**
 * A helper that needs asynchronous data (e.g. a database lookup). The evaluator stays
 * synchronous: see evaluateExpressionAsync for the bounded replay protocol.
 */
export interface AsyncExprHelper {
  resolve(args: ExprValue[]): Promise<ExprValue> | ExprValue;
}

export interface AsyncExprOptions extends ExprOptions {
  /** Helpers resolved outside the synchronous evaluator; they override environment entries. */
  asyncHelpers?: Readonly<Record<string, AsyncExprHelper>>;
  /** Distinct async helper calls per evaluation. Defaults to 16, capped at 64. */
  maxHelperCalls?: number;
}

export interface ExprEnvironment extends ExprHelpers {
  record?: ExprValue;
  [key: string]: unknown;
}
