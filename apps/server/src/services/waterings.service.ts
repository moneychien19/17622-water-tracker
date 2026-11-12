import {
  canUndo,
  type DashboardPlant,
  type Watering,
  type WateringHistoryPage,
} from '@water/shared';
import { groupIdForPlant, groupIdForWatering, requireMember, requireRole } from '../authz/guards';
import { ConflictError, ForbiddenError } from '../lib/errors';
import type { ServiceContext } from './context';
import { loadDashboardPlant } from './dashboard.service';

const HISTORY_PAGE_SIZE = 20;

/**
 * Append-only: concurrent waterings both persist and nextDueAt derives from the latest
 * non-undone event, so every view converges (research.md §4, FR-019).
 */
export async function recordWatering(
  ctx: ServiceContext,
  userId: string,
  plantId: string,
): Promise<{ watering: Watering; plant: DashboardPlant }> {
  const groupId = await groupIdForPlant(ctx.prisma, plantId);
  await requireRole(ctx.prisma, userId, groupId, 'watering:record');
  const result = await ctx.prisma.$transaction(async (tx) => {
    const event = await tx.wateringEvent.create({
      data: { plantId, wateredById: userId, wateredAt: ctx.now() },
      include: { wateredBy: { select: { id: true, displayName: true } } },
    });
    await tx.plant.update({ where: { id: plantId }, data: { version: { increment: 1 } } });
    const plant = await loadDashboardPlant(tx, plantId);
    const watering: Watering = {
      id: event.id,
      wateredAt: event.wateredAt,
      wateredBy: event.wateredBy,
    };
    return { watering, plant };
  });
  ctx.emitter.toGroup(groupId, 'plant:watered', result);
  return result;
}

/** Only the recorder, only within 10 minutes, only once (FR-009). */
export async function undoWatering(
  ctx: ServiceContext,
  userId: string,
  wateringId: string,
): Promise<DashboardPlant> {
  const groupId = await groupIdForWatering(ctx.prisma, wateringId);
  await requireRole(ctx.prisma, userId, groupId, 'watering:undo');
  const event = await ctx.prisma.wateringEvent.findUniqueOrThrow({ where: { id: wateringId } });
  if (event.wateredById !== userId) {
    throw new ForbiddenError('Only the person who recorded this watering can undo it');
  }
  if (!canUndo(event, userId, ctx.now())) {
    throw new ConflictError('This watering can no longer be undone');
  }
  const plant = await ctx.prisma.$transaction(async (tx) => {
    // Conditional update guards against a concurrent double-undo.
    const { count } = await tx.wateringEvent.updateMany({
      where: { id: wateringId, undoneAt: null },
      data: { undoneAt: ctx.now() },
    });
    if (count === 0) throw new ConflictError('This watering can no longer be undone');
    await tx.plant.update({ where: { id: event.plantId }, data: { version: { increment: 1 } } });
    return loadDashboardPlant(tx, event.plantId);
  });
  ctx.emitter.toGroup(groupId, 'plant:watering-undone', { plant, wateringId });
  return plant;
}

export async function wateringHistory(
  ctx: ServiceContext,
  userId: string,
  plantId: string,
  cursor: string | undefined,
): Promise<WateringHistoryPage> {
  const groupId = await groupIdForPlant(ctx.prisma, plantId);
  await requireMember(ctx.prisma, userId, groupId);
  const rows = await ctx.prisma.wateringEvent.findMany({
    where: { plantId, undoneAt: null },
    orderBy: [{ wateredAt: 'desc' }, { id: 'desc' }],
    take: HISTORY_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { wateredBy: { select: { id: true, displayName: true } } },
  });
  const page = rows.slice(0, HISTORY_PAGE_SIZE);
  const hasMore = rows.length > HISTORY_PAGE_SIZE;
  return {
    items: page.map((r) => ({ id: r.id, wateredAt: r.wateredAt, wateredBy: r.wateredBy })),
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}
