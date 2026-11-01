export type DbDialect = 'postgres' | 'sqlite' | 'mysql' | 'sqlserver' | 'oracle';

export interface DbCapabilities {
  transactionalDDL: boolean;
  schemas: boolean;
  jsonIndex: boolean;
  nativeDecimal: boolean;
  rowLevelSecurity: boolean;
  alterColumnConstraints: boolean;
}