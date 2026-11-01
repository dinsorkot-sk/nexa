import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface PlatformDatabase {
  users: UsersTable;
  tenants: TenantsTable;
  memberships: MembershipsTable;
  modules_registry: ModulesRegistryTable;
  sessions: SessionsTable;
}

export interface UsersTable {
  id: string;
  email: string;
  name: string | null;
  password_hash: string;
  created_at: Generated<string>;
}

export interface TenantsTable {
  id: string;
  slug: string;
  name: string;
  schema_name: string;
  db_connection: string | null;
  status: 'active' | 'suspended' | 'archived';
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface MembershipsTable {
  id: string;
  user_id: string;
  tenant_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  created_at: Generated<string>;
}

export interface ModulesRegistryTable {
  id: string;
  tenant_id: string;
  name: string;
  version: string;
  installed_at: Generated<string>;
}

export interface SessionsTable {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: Generated<string>;
}

export type UserRow = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type TenantRow = Selectable<TenantsTable>;
export type NewTenant = Insertable<TenantsTable>;
export type TenantUpdate = Updateable<TenantsTable>;
export type MembershipRow = Selectable<MembershipsTable>;
export type NewMembership = Insertable<MembershipsTable>;
export type SessionRow = Selectable<SessionsTable>;
export type NewSession = Insertable<SessionsTable>;