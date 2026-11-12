import { describe, expect, it } from 'vitest';
import { classifyPlant, computeNextDue, groupDashboard } from '../../src/domain/schedule';

const DAY = 24 * 60 * 60 * 1000;

describe('computeNextDue', () => {
  const createdAt = new Date('2026-03-01T12:00:00Z');

  it('returns createdAt for a plant that has never been watered', () => {
    expect(computeNextDue({ createdAt, intervalDays: 3, lastWateredAt: null })).toEqual(createdAt);
  });

  it('returns lastWateredAt + intervalDays × 24h', () => {
    const last = new Date('2026-03-05T08:30:00Z');
    expect(computeNextDue({ createdAt, intervalDays: 3, lastWateredAt: last })).toEqual(
      new Date(last.getTime() + 3 * DAY),
    );
  });

  it('uses exact 24h multiples across a DST change', () => {
    const last = new Date('2026-03-07T12:00:00Z'); // US DST starts 2026-03-08
    expect(computeNextDue({ createdAt, intervalDays: 2, lastWateredAt: last })).toEqual(
      new Date('2026-03-09T12:00:00Z'),
    );
  });
});

describe('classifyPlant', () => {
  const tz = 'America/New_York';
  // 2026-06-15 10:00 in New York (EDT, UTC-4)
  const now = new Date('2026-06-15T14:00:00Z');

  it('is needs_water when overdue', () => {
    expect(classifyPlant(new Date('2026-06-14T09:00:00Z'), now, tz)).toBe('needs_water');
  });

  it('is needs_water when due at 23:59 local today', () => {
    expect(classifyPlant(new Date('2026-06-16T03:59:00Z'), now, tz)).toBe('needs_water');
  });

  it('is ok when due at 00:00 local tomorrow', () => {
    expect(classifyPlant(new Date('2026-06-16T04:00:00Z'), now, tz)).toBe('ok');
  });

  it('depends on the viewer time zone for the same instant', () => {
    // 16:00Z = 01:00 Mar 11 in Tokyo (day ends 14:59:59Z Mar 11)
    //        = 09:00 Mar 10 in Los Angeles (day ends 06:59:59Z Mar 11)
    const instantNow = new Date('2026-03-10T16:00:00Z');
    const due = new Date('2026-03-11T10:00:00Z');
    expect(classifyPlant(due, instantNow, 'Asia/Tokyo')).toBe('needs_water');
    expect(classifyPlant(due, instantNow, 'America/Los_Angeles')).toBe('ok');
  });
});

describe('groupDashboard', () => {
  const now = new Date('2026-06-15T14:00:00Z');
  const tz = 'America/New_York';
  const plant = (id: string, nextDueAt: string, location: 'inside' | 'outside' = 'inside') => ({
    id,
    nextDueAt: new Date(nextDueAt),
    location,
  });
  const plants = [
    plant('cactus', '2026-06-29T12:00:00Z'),
    plant('fern', '2026-06-15T12:00:00Z'),
    plant('basil', '2026-06-13T12:00:00Z', 'outside'),
    plant('mint', '2026-06-17T12:00:00Z', 'outside'),
  ];

  it('splits into needsWater and ok, both sorted by nextDueAt ascending', () => {
    const g = groupDashboard(plants, now, tz);
    expect(g.needsWater.map((p) => p.id)).toEqual(['basil', 'fern']);
    expect(g.ok.map((p) => p.id)).toEqual(['mint', 'cactus']);
  });

  it('filters to outside plants when outsideOnly is set', () => {
    const g = groupDashboard(plants, now, tz, { outsideOnly: true });
    expect(g.needsWater.map((p) => p.id)).toEqual(['basil']);
    expect(g.ok.map((p) => p.id)).toEqual(['mint']);
  });

  it('does not mutate the input array', () => {
    const before = plants.map((p) => p.id);
    groupDashboard(plants, now, tz);
    expect(plants.map((p) => p.id)).toEqual(before);
  });
});
