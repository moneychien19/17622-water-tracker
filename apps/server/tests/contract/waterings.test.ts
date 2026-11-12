import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addMember,
  call,
  createPlantViaApi,
  createSharedGroup,
  createUserAndLogin,
  setupTestApp,
  type LoggedInUser,
  type PlantJson,
  type TestApp,
} from '../helpers/app';

/** Session expiry uses the same clock, so test times stay near the real present. */
const T0 = new Date(Math.floor(Date.now() / 1000) * 1000);
const DAY = 86_400_000;

interface WateringJson {
  id: string;
  wateredAt: string;
  wateredBy: { id: string; displayName: string };
}

describe('watering routes', () => {
  let t: TestApp;
  let alice: LoggedInUser;
  let bob: LoggedInUser;
  let carol: LoggedInUser;
  let groupId: string;

  beforeAll(async () => {
    t = await setupTestApp();
    alice = await createUserAndLogin(t.app, { displayName: 'Alice' });
    bob = await createUserAndLogin(t.app, { displayName: 'Bob' });
    carol = await createUserAndLogin(t.app, { displayName: 'Carol' });
    groupId = await createSharedGroup(t.prisma, alice.user.id);
    await addMember(t.prisma, groupId, bob.user.id);
  });
  afterAll(async () => {
    await t.teardown();
  });
  beforeEach(() => {
    t.clock.real();
  });

  const water = (cookie: string, plantId: string, payload?: object) =>
    call(t.app, 'POST', `/api/plants/${plantId}/waterings`, {
      cookie,
      ...(payload ? { payload } : {}),
    });

  describe('POST /api/plants/:id/waterings', () => {
    it('records a server-timed watering, bumps version, and updates nextDueAt', async () => {
      const plant = await createPlantViaApi(t.app, alice.cookie, groupId, { intervalDays: 2 });
      t.clock.set(T0);
      t.emitter.clear();

      const res = await water(bob.cookie, plant.id, { wateredAt: '2000-01-01T00:00:00Z' });
      expect(res.statusCode).toBe(201);
      const { watering, plant: after } = res.json<{ watering: WateringJson; plant: PlantJson }>();
      expect(watering.wateredAt).toBe(T0.toISOString());
      expect(watering.wateredBy).toEqual({ id: bob.user.id, displayName: 'Bob' });
      expect(after.version).toBe(plant.version + 1);
      expect(after.nextDueAt).toBe(new Date(T0.getTime() + 2 * DAY).toISOString());
      expect(after.lastWatering?.byDisplayName).toBe('Bob');
      expect(t.emitter.events('plant:watered')).toHaveLength(1);
    });

    it('returns 404 to a non-member', async () => {
      const plant = await createPlantViaApi(t.app, alice.cookie, groupId);
      expect((await water(carol.cookie, plant.id)).statusCode).toBe(404);
    });
  });

  describe('POST /api/waterings/:id/undo', () => {
    const undo = (cookie: string, wateringId: string) =>
      call(t.app, 'POST', `/api/waterings/${wateringId}/undo`, { cookie });

    async function freshWatering(cookie: string) {
      const plant = await createPlantViaApi(t.app, alice.cookie, groupId);
      t.clock.set(T0);
      const res = await water(cookie, plant.id);
      return { plant, watering: res.json<{ watering: WateringJson }>().watering };
    }

    it('undoes within 10 minutes, reverting nextDueAt and bumping version', async () => {
      const { plant, watering } = await freshWatering(alice.cookie);
      t.clock.advance(10 * 60 * 1000);
      t.emitter.clear();
      const res = await undo(alice.cookie, watering.id);
      expect(res.statusCode).toBe(200);
      const after = res.json<{ plant: PlantJson }>().plant;
      expect(after.lastWatering).toBeNull();
      expect(after.version).toBe(plant.version + 2);
      expect(t.emitter.events('plant:watering-undone')).toHaveLength(1);
    });

    it('returns 409 after 10 minutes', async () => {
      const { watering } = await freshWatering(alice.cookie);
      t.clock.advance(10 * 60 * 1000 + 1000);
      expect((await undo(alice.cookie, watering.id)).statusCode).toBe(409);
    });

    it('returns 409 when already undone', async () => {
      const { watering } = await freshWatering(alice.cookie);
      expect((await undo(alice.cookie, watering.id)).statusCode).toBe(200);
      expect((await undo(alice.cookie, watering.id)).statusCode).toBe(409);
    });

    it("returns 403 for another member's watering and 404 for a non-member", async () => {
      const { watering } = await freshWatering(bob.cookie);
      expect((await undo(alice.cookie, watering.id)).statusCode).toBe(403);
      expect((await undo(carol.cookie, watering.id)).statusCode).toBe(404);
    });
  });

  describe('GET /api/plants/:id/waterings', () => {
    it('returns newest first, excludes undone, and pages 20 at a time', async () => {
      const plant = await createPlantViaApi(t.app, alice.cookie, groupId);
      const base = T0.getTime() - DAY;
      for (let i = 0; i < 23; i++) {
        t.clock.set(new Date(base + i * 60_000));
        await water(alice.cookie, plant.id);
      }
      // Undo the newest one.
      const newest = await t.prisma.wateringEvent.findFirstOrThrow({
        where: { plantId: plant.id },
        orderBy: { wateredAt: 'desc' },
      });
      t.clock.set(new Date(base + 22 * 60_000 + 1000));
      const undone = await call(t.app, 'POST', `/api/waterings/${newest.id}/undo`, {
        cookie: alice.cookie,
      });
      expect(undone.statusCode).toBe(200);

      const page1 = await call(t.app, 'GET', `/api/plants/${plant.id}/waterings`, {
        cookie: bob.cookie,
      });
      expect(page1.statusCode).toBe(200);
      const p1 = page1.json<{ items: WateringJson[]; nextCursor: string | null }>();
      expect(p1.items).toHaveLength(20);
      expect(p1.items.some((w) => w.id === newest.id)).toBe(false);
      const times = p1.items.map((w) => new Date(w.wateredAt).getTime());
      expect([...times].sort((a, b) => b - a)).toEqual(times);
      expect(p1.nextCursor).not.toBeNull();

      const page2 = await call(
        t.app,
        'GET',
        `/api/plants/${plant.id}/waterings?cursor=${encodeURIComponent(p1.nextCursor ?? '')}`,
        { cookie: bob.cookie },
      );
      const p2 = page2.json<{ items: WateringJson[]; nextCursor: string | null }>();
      expect(p2.items).toHaveLength(2);
      expect(p2.nextCursor).toBeNull();
    });

    it('returns 404 to a non-member', async () => {
      const plant = await createPlantViaApi(t.app, alice.cookie, groupId);
      const res = await call(t.app, 'GET', `/api/plants/${plant.id}/waterings`, {
        cookie: carol.cookie,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  it('every watering route returns 401 when signed out', async () => {
    const plant = await createPlantViaApi(t.app, alice.cookie, groupId);
    expect((await call(t.app, 'POST', `/api/plants/${plant.id}/waterings`)).statusCode).toBe(401);
    expect((await call(t.app, 'GET', `/api/plants/${plant.id}/waterings`)).statusCode).toBe(401);
    expect((await call(t.app, 'POST', '/api/waterings/any/undo')).statusCode).toBe(401);
  });
});
