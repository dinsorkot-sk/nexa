import { inventoryTemplate } from '@nexa/template-inventory';
import { crmTemplate } from '@nexa/template-crm';
import { hrTemplate } from '@nexa/template-hr';

/**
 * The metadata templates that ship with the platform. They are pure metadata
 * with no domain logic, so a template installs into a tenant as an ordinary
 * draft module.
 */
export const metadataTemplates = {
  inventory: inventoryTemplate,
  crm: crmTemplate,
  hr: hrTemplate,
} as const;

export type MetadataTemplateId = keyof typeof metadataTemplates;

/** Whether a value names one of the built-in templates. */
export function isMetadataTemplateId(value: string): value is MetadataTemplateId {
  return Object.hasOwn(metadataTemplates, value);
}
