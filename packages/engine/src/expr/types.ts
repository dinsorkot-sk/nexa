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
}

export interface ExprEnvironment extends ExprHelpers {
  record?: ExprValue;
  [key: string]: unknown;
}
