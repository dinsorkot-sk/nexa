CREATE TABLE "nexa_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_id" text,
	"record_id" uuid,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nexa_event_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"correlation_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nexa_metadata_definitions" (
	"tenant_id" uuid NOT NULL,
	"module_id" text NOT NULL,
	"kind" text NOT NULL,
	"id" text NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nexa_metadata_definitions_tenant_id_module_id_kind_id_pk" PRIMARY KEY("tenant_id","module_id","kind","id")
);
--> statement-breakpoint
CREATE TABLE "nexa_modules" (
	"tenant_id" uuid NOT NULL,
	"id" text NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nexa_modules_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "nexa_record_links" (
	"tenant_id" uuid NOT NULL,
	"relation_id" text NOT NULL,
	"from_record_id" uuid NOT NULL,
	"to_record_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nexa_record_links_tenant_id_relation_id_from_record_id_to_record_id_pk" PRIMARY KEY("tenant_id","relation_id","from_record_id","to_record_id")
);
--> statement-breakpoint
CREATE TABLE "nexa_records" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_id" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "nexa_records_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "nexa_system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nexa_tenants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nexa_tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "nexa_audit_log" ADD CONSTRAINT "nexa_audit_log_tenant_id_nexa_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."nexa_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nexa_event_log" ADD CONSTRAINT "nexa_event_log_tenant_id_nexa_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."nexa_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nexa_metadata_definitions" ADD CONSTRAINT "nexa_metadata_definitions_tenant_id_nexa_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."nexa_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nexa_modules" ADD CONSTRAINT "nexa_modules_tenant_id_nexa_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."nexa_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nexa_records" ADD CONSTRAINT "nexa_records_tenant_id_nexa_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."nexa_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nexa_audit_log_tenant_time_idx" ON "nexa_audit_log" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "nexa_event_log_tenant_time_idx" ON "nexa_event_log" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "nexa_metadata_definitions_module_idx" ON "nexa_metadata_definitions" USING btree ("tenant_id","module_id","kind");--> statement-breakpoint
CREATE INDEX "nexa_modules_tenant_idx" ON "nexa_modules" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "nexa_record_links_target_idx" ON "nexa_record_links" USING btree ("tenant_id","to_record_id");--> statement-breakpoint
CREATE INDEX "nexa_records_tenant_entity_idx" ON "nexa_records" USING btree ("tenant_id","entity_id");--> statement-breakpoint
CREATE INDEX "nexa_records_data_gin_idx" ON "nexa_records" USING gin ("data");--> statement-breakpoint
CREATE INDEX "nexa_records_live_idx" ON "nexa_records" USING btree ("tenant_id","entity_id") WHERE "nexa_records"."deleted_at" IS NULL;