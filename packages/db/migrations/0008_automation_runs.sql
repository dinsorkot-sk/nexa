CREATE TABLE "nexa_automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"module_id" text NOT NULL,
	"automation_id" text NOT NULL,
	"trigger_type" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"correlation_id" text,
	"record_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nexa_automation_runs" ADD CONSTRAINT "nexa_automation_runs_tenant_id_nexa_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."nexa_tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE INDEX "nexa_automation_runs_tenant_time_idx" ON "nexa_automation_runs" USING btree ("tenant_id","created_at");
--> statement-breakpoint
CREATE INDEX "nexa_automation_runs_tenant_auto_idx" ON "nexa_automation_runs" USING btree ("tenant_id","automation_id","created_at");
