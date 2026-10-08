CREATE UNIQUE INDEX nexa_users_tenant_email_uq ON nexa_users (tenant_id, lower(email));
--> statement-breakpoint
ALTER TABLE nexa_sessions
  ADD CONSTRAINT nexa_sessions_token_digest_format CHECK (token_digest ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE nexa_users
  ADD CONSTRAINT nexa_users_status_check CHECK (status IN ('active', 'disabled'));
--> statement-breakpoint
ALTER TABLE nexa_role_assignments
  ADD CONSTRAINT nexa_role_assignments_system_role_check CHECK (is_system_role IN ('true', 'false'));
