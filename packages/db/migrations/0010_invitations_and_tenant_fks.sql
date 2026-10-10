ALTER TABLE nexa_record_links
  ADD CONSTRAINT nexa_record_links_tenant_fk FOREIGN KEY (tenant_id) REFERENCES nexa_tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
CREATE TABLE nexa_invitations (
  tenant_id uuid NOT NULL REFERENCES nexa_tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role_id text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT nexa_invitations_token_hash_uq UNIQUE (token_hash),
  CONSTRAINT nexa_invitations_token_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT nexa_invitations_role_check CHECK (role_id IN ('admin', 'member', 'viewer')),
  CONSTRAINT nexa_invitations_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT nexa_invitations_creator_membership_fk FOREIGN KEY (tenant_id, created_by) REFERENCES nexa_organization_memberships(tenant_id, user_id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX nexa_invitations_tenant_email_idx ON nexa_invitations (tenant_id, email);
