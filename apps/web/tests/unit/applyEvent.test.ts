import type { DashboardPlant, DashboardResponse } from '@water/shared';
import { describe, expect, it } from 'vitest';
import { applyEvent } from '../../src/realtime/applyEvent';

function plant(id: string, groupId: string, version: number, name = id): DashboardPlant {
  const t = new Date('2026-06-15T12:00:00Z');
  return {
    id,
    groupId,
    name,
    intervalDays: 3,
    location: 'inside',
    notes: null,
    version,
    createdAt: t,
    updatedAt: t,
    groupName: groupId,
    lastWatering: null,
    nextDueAt: t,
  };
}

const cache = (...plants: DashboardPlant[]): DashboardResponse => ({
  plants,
  serverTime: new Date('2026-06-15T12:00:00Z'),
});

describe('applyEvent', () => {
  const base = cache(plant('fern', 'g1', 2), plant('basil', 'g1', 5), plant('tomato', 'g2', 1));

  it('replaces a plant when the event version is higher', () => {
    const next = applyEvent(base, {
      type: 'plant:updated',
      payload: { plant: plant('fern', 'g1', 3, 'Boston Fern') },
    });
    expect(next?.plants.find((p) => p.id === 'fern')?.name).toBe('Boston Fern');
  });

  it.each([2, 1])('ignores a plant event with version %i (not newer)', (version) => {
    const next = applyEvent(base, {
      type: 'plant:watered',
      payload: {
        plant: plant('fern', 'g1', version, 'Stale'),
        watering: { id: 'w', wateredAt: new Date(), wateredBy: { id: 'u', displayName: 'U' } },
      },
    });
    expect(next).toBe(base);
  });

  it('applies plant:watering-undone with the version rule', () => {
    const next = applyEvent(base, {
      type: 'plant:watering-undone',
      payload: { plant: plant('basil', 'g1', 6, 'Basil!'), wateringId: 'w1' },
    });
    expect(next?.plants.find((p) => p.id === 'basil')?.name).toBe('Basil!');
  });

  it('removes a plant on plant:deleted', () => {
    const next = applyEvent(base, {
      type: 'plant:deleted',
      payload: { plantId: 'basil', groupId: 'g1' },
    });
    expect(next?.plants.map((p) => p.id)).toEqual(['fern', 'tomato']);
  });

  it.each(['group:access-revoked', 'group:deleted'] as const)(
    'removes every plant of the group on %s',
    (type) => {
      const next = applyEvent(base, { type, payload: { groupId: 'g1' } });
      expect(next?.plants.map((p) => p.id)).toEqual(['tomato']);
    },
  );

  it('appends an unknown plant on plant:created', () => {
    const next = applyEvent(base, {
      type: 'plant:created',
      payload: { plant: plant('mint', 'g2', 1) },
    });
    expect(next?.plants.map((p) => p.id)).toEqual(['fern', 'basil', 'tomato', 'mint']);
  });

  it('leaves the cache unchanged for events that do not affect plants', () => {
    const next = applyEvent(base, {
      type: 'group:member-left',
      payload: { groupId: 'g1', userId: 'u2' },
    });
    expect(next).toBe(base);
  });

  it('returns undefined when there is no cache yet', () => {
    expect(
      applyEvent(undefined, { type: 'plant:deleted', payload: { plantId: 'x', groupId: 'g' } }),
    ).toBeUndefined();
  });
});
