import {
  RoleSchema,
  type CreateGroupBody,
  type Group,
  type GroupWithRole,
  type UpdateGroupBody,
} from '@water/shared';
import { requireRole } from '../authz/guards';
import { ConflictError } from '../lib/errors';
import type { ServiceContext } from './context';

const groupSelect = { id: true, name: true, isPersonal: true, createdAt: true } as const;

export async function listGroupsForUser(
  ctx: ServiceContext,
  userId: string,
): Promise<GroupWithRole[]> {
  const memberships = await ctx.prisma.membership.findMany({
    where: { userId },
    include: { group: { select: groupSelect } },
    orderBy: [{ group: { isPersonal: 'desc' } }, { group: { createdAt: 'asc' } }],
  });
  return memberships.map((m) => ({ ...m.group, role: RoleSchema.parse(m.role) }));
}

export async function createGroup(
  ctx: ServiceContext,
  userId: string,
  body: CreateGroupBody,
): Promise<Group> {
  return ctx.prisma.group.create({
    data: { name: body.name, memberships: { create: { userId, role: 'owner' } } },
    select: groupSelect,
  });
}

export async function renameGroup(
  ctx: ServiceContext,
  userId: string,
  groupId: string,
  body: UpdateGroupBody,
): Promise<Group> {
  await requireRole(ctx.prisma, userId, groupId, 'group:update');
  const group = await ctx.prisma.group.update({
    where: { id: groupId },
    data: { name: body.name },
    select: groupSelect,
  });
  ctx.emitter.toGroup(groupId, 'group:updated', { group });
  return group;
}

/** Owner only; personal groups cannot be deleted. Cascades to plants, waterings, members. */
export async function deleteGroup(
  ctx: ServiceContext,
  userId: string,
  groupId: string,
): Promise<void> {
  await requireRole(ctx.prisma, userId, groupId, 'group:delete');
  const group = await ctx.prisma.group.findUniqueOrThrow({ where: { id: groupId } });
  if (group.isPersonal) throw new ConflictError('Your personal group cannot be deleted');
  await ctx.prisma.group.delete({ where: { id: groupId } });
  ctx.emitter.toGroup(groupId, 'group:deleted', { groupId });
  ctx.emitter.evictGroup(groupId);
}
