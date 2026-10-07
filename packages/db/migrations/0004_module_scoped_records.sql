ALTER TABLE nexa_records ADD COLUMN module_id text;

-- Existing records have no module identity, so retain them as legacy rows with NULL module_id.
--> statement-breakpoint
CREATE INDEX nexa_records_tenant_module_entity_idx
  ON nexa_records (tenant_id, module_id, entity_id);
--> statement-breakpoint
CREATE INDEX nexa_records_live_module_entity_idx
  ON nexa_records (tenant_id, module_id, entity_id)
  WHERE deleted_at IS NULL;
