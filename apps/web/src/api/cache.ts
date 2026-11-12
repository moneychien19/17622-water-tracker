import type { DashboardPlant, DashboardResponse } from '@water/shared';

/**
 * Pure cache helpers shared by mutations and real-time events.
 * Convergence rule (research.md §4): a plant is replaced only by a strictly newer version.
 */
export function upsertPlant(
  data: DashboardResponse | undefined,
  plant: DashboardPlant,
): DashboardResponse | undefined {
  if (!data) return data;
  const idx = data.plants.findIndex((p) => p.id === plant.id);
  if (idx === -1) return { ...data, plants: [...data.plants, plant] };
  const current = data.plants[idx];
  if (current && current.version >= plant.version) return data;
  const plants = [...data.plants];
  plants[idx] = plant;
  return { ...data, plants };
}

export function removePlant(
  data: DashboardResponse | undefined,
  plantId: string,
): DashboardResponse | undefined {
  if (!data) return data;
  if (!data.plants.some((p) => p.id === plantId)) return data;
  return { ...data, plants: data.plants.filter((p) => p.id !== plantId) };
}

export function removeGroupPlants(
  data: DashboardResponse | undefined,
  groupId: string,
): DashboardResponse | undefined {
  if (!data) return data;
  if (!data.plants.some((p) => p.groupId === groupId)) return data;
  return { ...data, plants: data.plants.filter((p) => p.groupId !== groupId) };
}

/** Newer-version-wins for a single cached plant. */
export function newerPlant(
  current: DashboardPlant | undefined,
  incoming: DashboardPlant,
): DashboardPlant {
  return current && current.version >= incoming.version ? current : incoming;
}
