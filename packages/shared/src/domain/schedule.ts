import { TZDate } from '@date-fns/tz';
import { endOfDay } from 'date-fns';
import type { Location } from '../schemas/common';

const DAY_MS = 24 * 60 * 60 * 1000;

export type PlantStatus = 'needs_water' | 'ok';

/**
 * nextDueAt = lastWateredAt + intervalDays × 24h; a never-watered plant is due at createdAt.
 * Uses exact 24h multiples (UTC instants) so the result is the same in every time zone.
 */
export function computeNextDue(input: {
  createdAt: Date;
  intervalDays: number;
  lastWateredAt: Date | null;
}): Date {
  if (!input.lastWateredAt) return new Date(input.createdAt);
  return new Date(input.lastWateredAt.getTime() + input.intervalDays * DAY_MS);
}

/** `needs_water` when nextDueAt is on or before the end of "today" in the viewer's time zone. */
export function classifyPlant(nextDueAt: Date, now: Date, timeZone: string): PlantStatus {
  const endOfToday = endOfDay(new TZDate(now.getTime(), timeZone));
  return nextDueAt.getTime() <= endOfToday.getTime() ? 'needs_water' : 'ok';
}

export interface GroupablePlant {
  nextDueAt: Date;
  location: Location;
}

export interface DashboardGroups<T> {
  needsWater: T[];
  ok: T[];
}

/**
 * Split plants into "Needs water" (most overdue first) and "OK" (soonest due first),
 * optionally showing only plants that are outside (FR-011, FR-012).
 */
export function groupDashboard<T extends GroupablePlant>(
  plants: readonly T[],
  now: Date,
  timeZone: string,
  options: { outsideOnly?: boolean } = {},
): DashboardGroups<T> {
  const visible = options.outsideOnly ? plants.filter((p) => p.location === 'outside') : plants;
  const sorted = [...visible].sort((a, b) => a.nextDueAt.getTime() - b.nextDueAt.getTime());
  const result: DashboardGroups<T> = { needsWater: [], ok: [] };
  for (const p of sorted) {
    if (classifyPlant(p.nextDueAt, now, timeZone) === 'needs_water') result.needsWater.push(p);
    else result.ok.push(p);
  }
  return result;
}
