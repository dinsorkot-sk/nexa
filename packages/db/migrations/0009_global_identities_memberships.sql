ALTER TABLE nexa_user_role_memberships DROP CONSTRAINT nexa_user_role_memberships_user_fk;
--> statement-breakpoint
ALTER TABLE nexa_sessions DROP CONSTRAINT nexa_sessions_user_fk;
--> statement-breakpoint
CREATE TABLE nexa_organization_memberships (
  tenant_id uuid NOT NULL REFERENCES nexa_tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
--> statement-breakpoint
INSERT INTO nexa_organization_memberships (tenant_id, user_id)
SELECT tenant_id, id FROM nexa_users;
--> statement-breakpoint
DROP INDEX nexa_users_tenant_email_idx;
--> statement-breakpoint
DROP INDEX nexa_users_tenant_email_uq;
--> statement-breakpoint
ALTER TABLE nexa_users DROP CONSTRAINT nexa_users_tenant_id_fkey;
--> statement-breakpoint
ALTER TABLE nexa_users DROP CONSTRAINT nexa_users_pkey;
--> statement-breakpoint
ALTER TABLE nexa_users DROP COLUMN tenant_id;
--> statement-breakpoint
ALTER TABLE nexa_users ADD PRIMARY KEY (id);
--> statement-breakpoint
CREATE UNIQUE INDEX nexa_users_email_uq ON nexa_users (lower(email));
--> statement-breakpoint
ALTER TABLE nexa_organization_memberships
  ADD CONSTRAINT nexa_organization_memberships_user_fk FOREIGN KEY (user_id) REFERENCES nexa_users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE nexa_user_role_memberships
  ADD CONSTRAINT nexa_user_role_memberships_membership_fk FOREIGN KEY (tenant_id, user_id) REFERENCES nexa_organization_memberships(tenant_id, user_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE nexa_sessions
  ADD CONSTRAINT nexa_sessions_membership_fk FOREIGN KEY (tenant_id, user_id) REFERENCES nexa_organization_memberships(tenant_id, user_id) ON DELETE CASCADE;