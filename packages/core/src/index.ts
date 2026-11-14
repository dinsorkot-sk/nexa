export type TenantId = string & { readonly __brand: 'TenantId' }

export interface TenantScopedRecord {
  id: string
  tenantId: TenantId
}
