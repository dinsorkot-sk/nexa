export type TenantStatus = 'active' | 'suspended' | 'archived';

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  schemaName: string;
  dbConnection: string | null;
  status: TenantStatus;
  createdAt: string;
  updatedAt: string;
}

export type TenantRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface Membership {
  id: string;
  userId: string;
  tenantId: string;
  role: TenantRole;
  createdAt: string;
}

export interface ModuleRegistration {
  id: string;
  tenantId: string;
  name: string;
  version: string;
  installedAt: string;
}