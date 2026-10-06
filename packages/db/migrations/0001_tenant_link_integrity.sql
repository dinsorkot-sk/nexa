ALTER TABLE "nexa_metadata_definitions" ADD CONSTRAINT "nexa_metadata_definitions_tenant_module_fk" FOREIGN KEY ("tenant_id", "module_id") REFERENCES "nexa_modules"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "nexa_record_links" ADD CONSTRAINT "nexa_record_links_from_record_fk" FOREIGN KEY ("tenant_id", "from_record_id") REFERENCES "nexa_records"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "nexa_record_links" ADD CONSTRAINT "nexa_record_links_to_record_fk" FOREIGN KEY ("tenant_id", "to_record_id") REFERENCES "nexa_records"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
