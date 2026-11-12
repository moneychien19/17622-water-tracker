import type { Membership, PrismaClient } from '@prisma/client';
import { can, RoleSchema, type Action, type Role } from '@water/shared';
import { ForbiddenError, NotFoundError } from '../lib/errors';

export interface MembershipInfo {
  groupId: string;
  userId: string;
  role: Role;
}

function toInfo(m: Membership): MembershipInfo {
  return { groupId: m.groupId, userId: m.userId, role: RoleSchema.parse(m.role) };
}

export async function loadMembership(
  prisma: PrismaClient,
  userId: string,
  groupId: string,
): Promise<MembershipInfo | null> {
  const m = await prisma.membership.findUnique({ where: { groupId_userId: { groupId, userId } } });
  return m ? toInfo(m) : null;
}

/** Non-members get 404 — never 403 — so a group's existence is not revealed. */
export async function requireMember(
  prisma: PrismaClient,
  userId: string,
  groupId: string,
): Promise<MembershipInfo> {
  const m = await loadMembership(prisma, userId, groupId);
  if (!m) throw new NotFoundError();
  return m;
}

/** 404 for non-members, 403 for members whose role lacks the action. */
export async function requireRole(
  prisma: PrismaClient,
  userId: string,
  groupId: string,
  action: Action,
): Promise<MembershipInfo> {
  const m = await requireMember(prisma, userId, groupId);
  if (!can(m.role, action)) throw new ForbiddenError();
  return m;
}

export async function groupIdForPlant(prisma: PrismaClient, plantId: string): Promise<string> {
  const plant = await prisma.plant.findUnique({
    where: { id: plantId },
    select: { groupId: true },
  });
  if (!plant) throw new NotFoundError();
  return plant.groupId;
}

export async function groupIdForWatering(
  prisma: PrismaClient,
  wateringId: string,
): Promise<string> {
  const w = await prisma.wateringEvent.findUnique({
    where: { id: wateringId },
    select: { plant: { select: { groupId: true } } },
  });
  if (!w) throw new NotFoundError();
  return w.plant.groupId;
}
