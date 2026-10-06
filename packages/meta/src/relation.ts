import { z } from 'zod';
import { IdSchema } from './common';

export const RelationTypeSchema = z.enum(['oneToOne', 'oneToMany', 'manyToOne', 'manyToMany']);
export const RelationDefinitionSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  sourceEntityId: IdSchema,
  targetEntityId: IdSchema,
  type: RelationTypeSchema,
  sourceFieldId: IdSchema.optional(),
  targetFieldId: IdSchema.optional(),
  onDelete: z.enum(['cascade', 'restrict']).default('restrict'),
  reverseName: z.string().trim().min(1).max(120).optional(),
}).strict().superRefine((relation, ctx) => {
  if (relation.sourceEntityId === relation.targetEntityId && relation.type === 'manyToMany') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Self many-to-many relations are not supported',
      path: ['type'],
    });
  }
  if (relation.sourceFieldId && relation.sourceFieldId === relation.targetFieldId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Source and target fields must be different',
      path: ['targetFieldId'],
    });
  }
});
export type RelationType = z.infer<typeof RelationTypeSchema>;
export type RelationDefinition = z.infer<typeof RelationDefinitionSchema>;
