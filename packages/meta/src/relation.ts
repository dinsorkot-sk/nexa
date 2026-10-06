import { z } from 'zod';
import { IdSchema } from './common';

export const RelationTypeSchema = z.enum(['oneToOne', 'oneToMany', 'manyToOne', 'manyToMany']);

export const RelationCreateInputSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  sourceEntityId: IdSchema,
  targetEntityId: IdSchema,
  type: RelationTypeSchema,
  sourceFieldId: IdSchema.optional(),
  targetFieldId: IdSchema.optional(),
  onDelete: z.enum(['cascade', 'restrict']).default('restrict'),
  reverseName: z.string().trim().min(1).max(120).optional(),
}).strict().superRefine((input, ctx) => {
  if (input.sourceEntityId === input.targetEntityId && input.type === 'manyToMany') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Self many-to-many relations are not supported',
      path: ['type'],
    });
  }
  if (input.sourceFieldId && input.sourceFieldId === input.targetFieldId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Source and target fields must be different',
      path: ['targetFieldId'],
    });
  }
});
export type RelationCreateInput = z.infer<typeof RelationCreateInputSchema>;

export const RelationUpdateInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  reverseName: z.string().trim().min(1).max(120).nullable().optional(),
  onDelete: z.enum(['cascade', 'restrict']).optional(),
}).strict().refine((input) => Object.keys(input).length > 0, 'At least one relation property must be provided');
export type RelationUpdateInput = z.infer<typeof RelationUpdateInputSchema>;
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
