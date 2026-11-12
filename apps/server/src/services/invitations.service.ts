import type { Invitation as InvitationRow } from '@prisma/client';
import {
  effectiveStatus,
  InvitationStatusSchema,
  inviteExpiry,
  type Group,
  type Invitation,
  type MyInvitation,
} from '@water/shared';
import { requireRole } from '../authz/guards';
import { ConflictError, NotFoundError } from '../lib/errors';
import type { ServiceContext } from './context';

function toInvitation(row: InvitationRow, now: Date): Invitation {
  return {
    id: row.id,
    groupId: row.groupId,
    email: row.email,
    invitedById: row.invitedById,
    status: effectiveStatus(
      { status: InvitationStatusSchema.parse(row.status), expiresAt: row.expiresAt },
      now,
    ),
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

/** `email` is already lowercase-normalized by CreateInvitationBodySchema. */
export async function createInvitation(
  ctx: ServiceContext,
  ownerId: string,
  groupId: string,
  email: string,
): Promise<Invitation> {
  await requireRole(ctx.prisma, ownerId, groupId, 'member:invite');
  const now = ctx.now();
  const group = await ctx.prisma.group.findUniqueOrThrow({ where: { id: groupId } });
  if (group.isPersonal) {
    throw new ConflictError('Personal groups cannot be shared; create a separate group');
  }
  const existingMember = await ctx.prisma.membership.findFirst({
    where: { groupId, user: { email } },
  });
  if (existingMember) throw new ConflictError('That person is already a member of this group');
  const pending = await ctx.prisma.invitation.findFirst({
    where: { groupId, email, status: 'pending', expiresAt: { gt: now } },
  });
  if (pending) throw new ConflictError('That email already has a pending invitation');

  const row = await ctx.prisma.invitation.create({
    data: { groupId, email, invitedById: ownerId, createdAt: now, expiresAt: inviteExpiry(now) },
  });
  const invitation = toInvitation(row, now);

  const invitee = await ctx.prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (invitee) ctx.emitter.toUser(invitee.id, 'invitation:received', { invitation });
  return invitation;
}

export async function listGroupInvitations(
  ctx: ServiceContext,
  ownerId: string,
  groupId: string,
): Promise<Invitation[]> {
  await requireRole(ctx.prisma, ownerId, groupId, 'member:invite');
  const now = ctx.now();
  const rows = await ctx.prisma.invitation.findMany({
    where: { groupId, status: 'pending', expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => toInvitation(r, now));
}

export async function revokeInvitation(
  ctx: ServiceContext,
  ownerId: string,
  invitationId: string,
): Promise<void> {
  const row = await ctx.prisma.invitation.findUnique({ where: { id: invitationId } });
  if (!row) throw new NotFoundError();
  await requireRole(ctx.prisma, ownerId, row.groupId, 'member:invite');
  if (row.status !== 'pending') throw new ConflictError('Invitation is no longer pending');
  await ctx.prisma.invitation.update({ where: { id: row.id }, data: { status: 'revoked' } });
}

/** Pending, unexpired invitations addressed to the caller's email. */
export async function listMyInvitations(
  ctx: ServiceContext,
  email: string,
): Promise<MyInvitation[]> {
  const now = ctx.now();
  const rows = await ctx.prisma.invitation.findMany({
    where: { email, status: 'pending', expiresAt: { gt: now } },
    include: { group: { select: { name: true } }, invitedBy: { select: { displayName: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({
    ...toInvitation(r, now),
    groupName: r.group.name,
    invitedByName: r.invitedBy.displayName,
  }));
}

/** Invitation addressed to this user, else 404 (no existence leak). */
async function loadOwnInvitation(
  ctx: ServiceContext,
  user: { email: string },
  invitationId: string,
): Promise<InvitationRow> {
  const row = await ctx.prisma.invitation.findUnique({ where: { id: invitationId } });
  if (row?.email !== user.email) throw new NotFoundError();
  return row;
}

export async function acceptInvitation(
  ctx: ServiceContext,
  user: { id: string; email: string; displayName: string },
  invitationId: string,
): Promise<Group> {
  const row = await loadOwnInvitation(ctx, user, invitationId);
  const status = effectiveStatus(
    { status: InvitationStatusSchema.parse(row.status), expiresAt: row.expiresAt },
    ctx.now(),
  );
  if (status !== 'pending') throw new ConflictError(`Invitation is ${status}`);

  const group = await ctx.prisma.$transaction(async (tx) => {
    const { count } = await tx.invitation.updateMany({
      where: { id: row.id, status: 'pending' },
      data: { status: 'accepted' },
    });
    if (count === 0) throw new ConflictError('Invitation is no longer pending');
    await tx.membership.upsert({
      where: { groupId_userId: { groupId: row.groupId, userId: user.id } },
      create: { groupId: row.groupId, userId: user.id, role: 'caretaker' },
      update: {},
    });
    return tx.group.findUniqueOrThrow({
      where: { id: row.groupId },
      select: { id: true, name: true, isPersonal: true, createdAt: true },
    });
  });

  ctx.emitter.joinGroup(user.id, group.id);
  ctx.emitter.toGroup(group.id, 'group:member-joined', {
    groupId: group.id,
    member: { userId: user.id, displayName: user.displayName, role: 'caretaker' },
  });
  return group;
}

export async function declineInvitation(
  ctx: ServiceContext,
  user: { email: string },
  invitationId: string,
): Promise<void> {
  const row = await loadOwnInvitation(ctx, user, invitationId);
  if (row.status !== 'pending') throw new ConflictError('Invitation is no longer pending');
  await ctx.prisma.invitation.update({ where: { id: row.id }, data: { status: 'declined' } });
}
