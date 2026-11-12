import type { Prisma, PrismaClient } from '@prisma/client';
import {
  computeNextDue,
  LocationSchema,
  type DashboardPlant,
  type DashboardResponse,
} from '@water/shared';
import { NotFoundError } from '../lib/errors';
import type { ServiceContext } from './context';

/** Relations needed to build the DashboardPlant read model. */
export const plantInclude = {
  group: { select: { name: true } },
  waterings: {
    where: { undoneAt: null },
    orderBy: [{ wateredAt: 'desc' }, { id: 'desc' }],
    take: 1,
    include: { wateredBy: { select: { id: true, displayName: true } } },
  },
} as const satisfies Prisma.PlantInclude;

type PlantWithRelations = Prisma.PlantGetPayload<{ include: typeof plantInclude }>;

export function toDashboardPlant(p: PlantWithRelations): DashboardPlant {
  const last = p.waterings[0] ?? null;
  return {
    id: p.id,
    groupId: p.groupId,
    name: p.name,
    intervalDays: p.intervalDays,
    location: LocationSchema.parse(p.location),
    notes: p.notes,
    version: p.version,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    groupName: p.group.name,
    lastWatering: last
      ? {
          id: last.id,
          at: last.wateredAt,
          byUserId: last.wateredBy.id,
          byDisplayName: last.wateredBy.displayName,
        }
      : null,
    nextDueAt: computeNextDue({
      createdAt: p.createdAt,
      intervalDays: p.intervalDays,
      lastWateredAt: last?.wateredAt ?? null,
    }),
  };
}

export async function loadDashboardPlant(
  prisma: PrismaClient | Prisma.TransactionClient,
  plantId: string,
): Promise<DashboardPlant> {
  const p = await prisma.plant.findUnique({ where: { id: plantId }, include: plantInclude });
  if (!p) throw new NotFoundError();
  return toDashboardPlant(p);
}

/** All plants in all of the user's groups (FR-011). */
export async function getDashboard(
  ctx: ServiceContext,
  userId: string,
): Promise<DashboardResponse> {
  const plants = await ctx.prisma.plant.findMany({
    where: { group: { memberships: { some: { userId } } } },
    include: plantInclude,
    orderBy: { createdAt: 'asc' },
  });
  return { plants: plants.map(toDashboardPlant), serverTime: ctx.now() };
}
