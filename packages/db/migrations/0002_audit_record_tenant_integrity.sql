ALTER TABLE "nexa_audit_log" DROP CONSTRAINT "nexa_audit_log_tenant_id_nexa_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "nexa_audit_log" DROP CONSTRAINT "nexa_audit_log_pkey";
--> statement-breakpoint
ALTER TABLE "nexa_audit_log" ADD CONSTRAINT "nexa_audit_log_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "nexa_tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "nexa_audit_log" ADD CONSTRAINT "nexa_audit_log_tenant_record_fk" FOREIGN KEY ("tenant_id", "record_id") REFERENCES "nexa_records"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "nexa_audit_log" ADD CONSTRAINT "nexa_audit_log_tenant_id_id_pk" PRIMARY KEY ("tenant_id", "id");
