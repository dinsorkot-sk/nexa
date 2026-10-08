import { z } from 'zod';
import { IdSchema } from './common';

/** Password-based login input. */
export const LoginInputSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
}).strict();
export type LoginInput = z.infer<typeof LoginInputSchema>;

/** Signup input for first-admin bootstrap. */
export const SignupInputSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().max(200).optional(),
}).strict();
export type SignupInput = z.infer<typeof SignupInputSchema>;

/** Session stored in DB; client receives only the opaque token. */
export const SessionTokenSchema = z.string().regex(/^[0-9a-f]{64}$/i, 'Session token must be 64 hexadecimal characters');
export type SessionToken = z.infer<typeof SessionTokenSchema>;

/** Auth principal resolved from a validated session. */
export const PrincipalSchema = z.object({
  userId: IdSchema,
  tenantId: IdSchema,
  name: z.string().nullable(),
  roleIds: z.array(IdSchema),
});
export type Principal = z.infer<typeof PrincipalSchema>;

/** User model — password hash stored server-side only. */
export const UserCreateInputSchema = z.object({
  tenantId: IdSchema,
  email: z.string().trim().email().max(254),
  passwordHash: z.string().min(1),
  displayName: z.string().trim().max(200).default(''),
  status: z.enum(['active', 'disabled']).default('active'),
});
export type UserCreateInput = z.infer<typeof UserCreateInputSchema>;

export const UserPublicSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  email: z.string().trim().email().max(254),
  displayName: z.string(),
  status: z.enum(['active', 'disabled']),
  createdAt: z.string(),
});
export type UserPublic = z.infer<typeof UserPublicSchema>;

/** Role assignment within a tenant. */
export const RoleAssignmentSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).default(''),
  isSystemRole: z.boolean().default(false),
  createdAt: z.string(),
});
export type RoleAssignment = z.infer<typeof RoleAssignmentSchema>;

/** User-to-role membership. */
export const UserRoleMembershipSchema = z.object({
  userId: IdSchema,
  roleId: IdSchema,
  tenantId: IdSchema,
});
export type UserRoleMembership = z.infer<typeof UserRoleMembershipSchema>;
