import { z } from 'zod';
import { IdSchema } from './common';

/** Password-based login input. */
export const LoginInputSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  organizationId: z.string().uuid().optional(),
}).strict();
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const OrganizationSignupSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(3).max(50).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
}).strict();

/** Signup creates a global identity and its first organization. */
export const SignupInputSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().max(200).optional(),
  organization: OrganizationSignupSchema,
}).strict();
export type SignupInput = z.infer<typeof SignupInputSchema>;

export const OrganizationSelectInputSchema = z.object({
  tenantId: z.string().uuid(),
}).strict();
export type OrganizationSelectInput = z.infer<typeof OrganizationSelectInputSchema>;

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
  email: z.string().trim().email().max(254),
  passwordHash: z.string().min(1),
  displayName: z.string().trim().max(200).default(''),
  status: z.enum(['active', 'disabled']).default('active'),
});
export type UserCreateInput = z.infer<typeof UserCreateInputSchema>;

/** Global identity as exposed to clients. Organization context is carried by the session, not the user. */
export const UserPublicSchema = z.object({
  id: IdSchema,
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

/** The four system roles every organization is seeded with. */
export const SystemRoleIdSchema = z.enum(['owner', 'admin', 'member', 'viewer']);
export type SystemRoleId = z.infer<typeof SystemRoleIdSchema>;

/** Roles an invitation may grant. Owner is excluded so invitations cannot escalate privilege. */
export const InvitableRoleIdSchema = z.enum(['admin', 'member', 'viewer']);
export type InvitableRoleId = z.infer<typeof InvitableRoleIdSchema>;

export const OrganizationCreateInputSchema = OrganizationSignupSchema;
export type OrganizationCreateInput = z.infer<typeof OrganizationCreateInputSchema>;

export const MemberRoleUpdateInputSchema = z.object({
  roleId: SystemRoleIdSchema,
}).strict();
export type MemberRoleUpdateInput = z.infer<typeof MemberRoleUpdateInputSchema>;

export const InvitationCreateInputSchema = z.object({
  email: z.string().trim().email().max(254),
  roleId: InvitableRoleIdSchema,
}).strict();
export type InvitationCreateInput = z.infer<typeof InvitationCreateInputSchema>;

/** Accepting needs the organization id as well as the token, because the caller's session may belong to another organization. */
export const InvitationAcceptInputSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/, 'Invitation token must be 64 hexadecimal characters'),
  tenantId: z.string().uuid(),
}).strict();
export type InvitationAcceptInput = z.infer<typeof InvitationAcceptInputSchema>;
