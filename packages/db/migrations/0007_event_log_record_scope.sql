ALTER TABLE "nexa_event_log" ADD COLUMN "module_id" text;
--> statement-breakpoint
ALTER TABLE "nexa_event_log" ADD COLUMN "entity_id" text;
--> statement-breakpoint
ALTER TABLE "nexa_event_log" ADD COLUMN "record_id" uuid;
--> statement-breakpoint
ALTER TABLE "nexa_event_log" ADD COLUMN "actor_id" text;
--> statement-breakpoint
CREATE INDEX "nexa_event_log_tenant_record_idx" ON "nexa_event_log" USING btree ("tenant_id","record_id","occurred_at");
