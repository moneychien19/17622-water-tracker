import { RoleSchema, type Member } from '@water/shared';
import { loadMembership, requireMember, requireRole } from '../authz/guards';
import { ConflictError, NotFoundError } from '../lib/errors';
import type { ServiceContext } from './context';

export async function listMembers(
  ctx: ServiceContext,
  userId: string,
  groupId: string,
): Promise<Member[]> {
  await requireMember(ctx.prisma, userId, groupId);
  const rows = await ctx.prisma.membership.findMany({
    where: { groupId },
    include: { user: { select: { displayName: true, email: true } } },
    orderBy: { joinedAt: 'asc' },
  });
  const members = rows.map((m) => ({
    userId: m.userId,
    displayName: m.user.displayName,
    email: m.user.email,
    role: RoleSchema.parse(m.role),
  }));
  // Owner first, then caretakers in join order.
  return [
    ...members.filter((m) => m.role === 'owner'),
    ...members.filter((m) => m.role !== 'owner'),
  ];
}

/**
 * Owner removes a caretaker, or a caretaker leaves. The owner can never be removed (409).
 * Access is revoked immediately, including live updates (FR-017).
 */
export async function removeMember(
  ctx: ServiceContext,
  actorId: string,
  groupId: string,
  targetUserId: string,
): Promise<void> {
  await requireMember(ctx.prisma, actorId, groupId);
  const target = await loadMembership(ctx.prisma, targetUserId, groupId);
  if (!target) throw new NotFoundError();
  if (target.role === 'owner') {
    throw new ConflictError('The group owner cannot be removed. Delete the group instead.');
  }
  if (actorId === targetUserId) {
    await requireRole(ctx.prisma, actorId, groupId, 'group:leave');
  } else {
    await requireRole(ctx.prisma, actorId, groupId, 'member:remove');
  }

  await ctx.prisma.membership.delete({
    where: { groupId_userId: { groupId, userId: targetUserId } },
  });

  ctx.emitter.leaveGroup(targetUserId, groupId);
  ctx.emitter.toUser(targetUserId, 'group:access-revoked', { groupId });
  ctx.emitter.toGroup(groupId, 'group:member-left', { groupId, userId: targetUserId });
}
