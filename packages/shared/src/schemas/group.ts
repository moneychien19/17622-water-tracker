import { z } from 'zod';
import { EmailSchema, IdSchema, IsoDateTimeSchema, RoleSchema } from './common';

/** 1–60 chars */
const GroupNameSchema = z.string().trim().min(1).max(60);

export const GroupSchema = z.object({
  id: IdSchema,
  name: z.string(),
  isPersonal: z.boolean(),
  createdAt: IsoDateTimeSchema,
});
export type Group = z.infer<typeof GroupSchema>;

export const GroupWithRoleSchema = GroupSchema.extend({ role: RoleSchema });
export type GroupWithRole = z.infer<typeof GroupWithRoleSchema>;

export const CreateGroupBodySchema = z.object({ name: GroupNameSchema });
export type CreateGroupBody = z.infer<typeof CreateGroupBodySchema>;

export const UpdateGroupBodySchema = z.object({ name: GroupNameSchema });
export type UpdateGroupBody = z.infer<typeof UpdateGroupBodySchema>;

export const MemberSchema = z.object({
  userId: IdSchema,
  displayName: z.string(),
  email: z.string(),
  role: RoleSchema,
});
export type Member = z.infer<typeof MemberSchema>;

export const InvitationStatusSchema = z.enum([
  'pending',
  'accepted',
  'declined',
  'revoked',
  'expired',
]);
export type InvitationStatus = z.infer<typeof InvitationStatusSchema>;

export const InvitationSchema = z.object({
  id: IdSchema,
  groupId: IdSchema,
  email: z.string(),
  invitedById: IdSchema,
  status: InvitationStatusSchema,
  expiresAt: IsoDateTimeSchema,
  createdAt: IsoDateTimeSchema,
});
export type Invitation = z.infer<typeof InvitationSchema>;

export const MyInvitationSchema = InvitationSchema.extend({
  groupName: z.string(),
  invitedByName: z.string(),
});
export type MyInvitation = z.infer<typeof MyInvitationSchema>;

/** email: lowercase-normalized */
export const CreateInvitationBodySchema = z.object({ email: EmailSchema });
export type CreateInvitationBody = z.infer<typeof CreateInvitationBodySchema>;

// Response envelopes
export const GroupsResponseSchema = z.object({ groups: z.array(GroupWithRoleSchema) });
export const GroupResponseSchema = z.object({ group: GroupSchema });
export const MembersResponseSchema = z.object({ members: z.array(MemberSchema) });
export const InvitationResponseSchema = z.object({ invitation: InvitationSchema });
export const InvitationsResponseSchema = z.object({ invitations: z.array(InvitationSchema) });
export const MyInvitationsResponseSchema = z.object({ invitations: z.array(MyInvitationSchema) });
