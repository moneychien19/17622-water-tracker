import type { DashboardResponse, RealtimeEvent } from '@water/shared';
import { removeGroupPlants, removePlant, upsertPlant } from '../api/cache';

/**
 * Pure reducer: apply a server event to the dashboard cache.
 * Plant events replace a cached plant only when strictly newer (version rule, research.md §4).
 * Returns the same object when nothing changes so React Query skips re-renders.
 */
export function applyEvent(
  data: DashboardResponse | undefined,
  event: RealtimeEvent,
): DashboardResponse | undefined {
  switch (event.type) {
    case 'plant:created':
    case 'plant:updated':
    case 'plant:watered':
    case 'plant:watering-undone':
      return upsertPlant(data, event.payload.plant);
    case 'plant:deleted':
      return removePlant(data, event.payload.plantId);
    case 'group:access-revoked':
    case 'group:deleted':
      return removeGroupPlants(data, event.payload.groupId);
    case 'group:updated': {
      if (!data) return data;
      const { id, name } = event.payload.group;
      if (!data.plants.some((p) => p.groupId === id && p.groupName !== name)) return data;
      return {
        ...data,
        plants: data.plants.map((p) => (p.groupId === id ? { ...p, groupName: name } : p)),
      };
    }
    case 'group:member-joined':
    case 'group:member-left':
    case 'invitation:received':
      return data;
  }
}
