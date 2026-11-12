import {
  touchesRestrictedFields,
  type CreatePlantBody,
  type DashboardPlant,
  type UpdatePlantBody,
} from '@water/shared';
import { groupIdForPlant, requireMember, requireRole } from '../authz/guards';
import { ForbiddenError, ValidationError } from '../lib/errors';
import type { ServiceContext } from './context';
import { loadDashboardPlant } from './dashboard.service';

export async function createPlant(
  ctx: ServiceContext,
  userId: string,
  groupId: string,
  body: CreatePlantBody,
): Promise<DashboardPlant> {
  await requireRole(ctx.prisma, userId, groupId, 'plant:create');
  const now = ctx.now();
  if (body.lastWateredAt && body.lastWateredAt.getTime() > now.getTime()) {
    throw new ValidationError([
      { path: ['lastWateredAt'], message: 'Last watered date cannot be in the future' },
    ]);
  }
  const plant = await ctx.prisma.$transaction(async (tx) => {
    const created = await tx.plant.create({
      data: {
        groupId,
        name: body.name,
        intervalDays: body.intervalDays,
        location: body.location,
        notes: body.notes ?? null,
        createdAt: now,
      },
    });
    if (body.lastWateredAt) {
      await tx.wateringEvent.create({
        data: { plantId: created.id, wateredById: userId, wateredAt: body.lastWateredAt },
      });
    }
    return loadDashboardPlant(tx, created.id);
  });
  ctx.emitter.toGroup(groupId, 'plant:created', { plant });
  return plant;
}

export async function getPlant(
  ctx: ServiceContext,
  userId: string,
  plantId: string,
): Promise<DashboardPlant> {
  const groupId = await groupIdForPlant(ctx.prisma, plantId);
  await requireMember(ctx.prisma, userId, groupId);
  return loadDashboardPlant(ctx.prisma, plantId);
}

/** Owners may change any field; caretakers only `location` and `notes` (FR-015). */
export async function updatePlant(
  ctx: ServiceContext,
  userId: string,
  plantId: string,
  body: UpdatePlantBody,
): Promise<DashboardPlant> {
  const groupId = await groupIdForPlant(ctx.prisma, plantId);
  const membership = await requireRole(ctx.prisma, userId, groupId, 'plant:update:care');
  if (touchesRestrictedFields(membership.role, body)) {
    throw new ForbiddenError('Only the group owner can change the name or watering interval');
  }
  const plant = await ctx.prisma.$transaction(async (tx) => {
    await tx.plant.update({
      where: { id: plantId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.intervalDays !== undefined ? { intervalDays: body.intervalDays } : {}),
        ...(body.location !== undefined ? { location: body.location } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        version: { increment: 1 },
      },
    });
    return loadDashboardPlant(tx, plantId);
  });
  ctx.emitter.toGroup(groupId, 'plant:updated', { plant });
  return plant;
}

export async function deletePlant(
  ctx: ServiceContext,
  userId: string,
  plantId: string,
): Promise<void> {
  const groupId = await groupIdForPlant(ctx.prisma, plantId);
  await requireRole(ctx.prisma, userId, groupId, 'plant:delete');
  await ctx.prisma.plant.delete({ where: { id: plantId } });
  ctx.emitter.toGroup(groupId, 'plant:deleted', { plantId, groupId });
}
