CREATE TABLE nexa_users (
  tenant_id uuid NOT NULL REFERENCES nexa_tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
--> statement-breakpoint
CREATE INDEX nexa_users_tenant_email_idx ON nexa_users (tenant_id, email);
--> statement-breakpoint
CREATE TABLE nexa_role_assignments (
  tenant_id uuid NOT NULL REFERENCES nexa_tenants(id) ON DELETE CASCADE,
  id text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_system_role text NOT NULL DEFAULT 'false',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
--> statement-breakpoint
CREATE INDEX nexa_role_assignments_tenant_name_idx ON nexa_role_assignments (tenant_id, name);
--> statement-breakpoint
CREATE TABLE nexa_user_role_memberships (
  tenant_id uuid NOT NULL REFERENCES nexa_tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, role_id),
  CONSTRAINT nexa_user_role_memberships_user_fk FOREIGN KEY (tenant_id, user_id) REFERENCES nexa_users(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT nexa_user_role_memberships_role_fk FOREIGN KEY (tenant_id, role_id) REFERENCES nexa_role_assignments(tenant_id, id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX nexa_user_role_memberships_user_idx ON nexa_user_role_memberships (tenant_id, user_id);
--> statement-breakpoint
CREATE TABLE nexa_sessions (
  tenant_id uuid NOT NULL REFERENCES nexa_tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_digest text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT nexa_sessions_token_digest_uq UNIQUE (token_digest),
  CONSTRAINT nexa_sessions_user_fk FOREIGN KEY (tenant_id, user_id) REFERENCES nexa_users(tenant_id, id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX nexa_sessions_user_idx ON nexa_sessions (tenant_id, user_id);
