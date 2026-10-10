CREATE TABLE nexa_outbox (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES nexa_tenants(id) ON DELETE CASCADE,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT nexa_outbox_dedupe_uq UNIQUE (tenant_id, dedupe_key),
  CONSTRAINT nexa_outbox_status_check CHECK (status IN ('pending', 'processing', 'done', 'dead')),
  CONSTRAINT nexa_outbox_attempts_check CHECK (attempts >= 0 AND max_attempts >= 1)
);
--> statement-breakpoint
CREATE INDEX nexa_outbox_ready_idx ON nexa_outbox (status, available_at);
