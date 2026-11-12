import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addMember,
  call,
  createPlantViaApi,
  createSharedGroup,
  createUserAndLogin,
  personalGroupId,
  setupTestApp,
  type LoggedInUser,
  type PlantJson,
  type TestApp,
} from '../helpers/app';

describe('plant routes', () => {
  let t: TestApp;
  let alice: LoggedInUser;
  let bob: LoggedInUser;
  let aliceGroup: string;

  beforeAll(async () => {
    t = await setupTestApp();
    alice = await createUserAndLogin(t.app, { displayName: 'Alice' });
    bob = await createUserAndLogin(t.app, { displayName: 'Bob' });
    aliceGroup = await personalGroupId(t.prisma, alice.user.id);
  });
  afterAll(async () => {
    await t.teardown();
  });

  describe('POST /api/groups/:groupId/plants', () => {
    it('creates a never-watered plant that is due at creation', async () => {
      t.emitter.clear();
      const res = await call(t.app, 'POST', `/api/groups/${aliceGroup}/plants`, {
        cookie: alice.cookie,
        payload: { name: 'Fern', intervalDays: 3, location: 'inside', notes: 'north window' },
      });
      expect(res.statusCode).toBe(201);
      const { plant } = res.json<{ plant: PlantJson & { createdAt: string } }>();
      expect(plant).toMatchObject({
        name: 'Fern',
        intervalDays: 3,
        location: 'inside',
        notes: 'north window',
        groupName: 'My Plants',
        version: 1,
        lastWatering: null,
      });
      expect(plant.nextDueAt).toBe(plant.createdAt);
      expect(t.emitter.events('plant:created')).toHaveLength(1);
    });

    it('records lastWateredAt as a watering event and computes nextDueAt from it', async () => {
      const last = new Date(Date.now() - 2 * 86_400_000);
      const plant = await createPlantViaApi(t.app, alice.cookie, aliceGroup, {
        name: 'Basil',
        intervalDays: 1,
        location: 'outside',
        lastWateredAt: last.toISOString(),
      });
      expect(plant.lastWatering?.byDisplayName).toBe('Alice');
      expect(new Date(plant.nextDueAt).getTime()).toBe(last.getTime() + 86_400_000);
      const events = await t.prisma.wateringEvent.findMany({ where: { plantId: plant.id } });
      expect(events).toHaveLength(1);
      expect(events[0]?.wateredAt.getTime()).toBe(last.getTime());
    });

    it.each([
      ['intervalDays 0', { intervalDays: 0 }],
      ['intervalDays 366', { intervalDays: 366 }],
      ['non-integer interval', { intervalDays: 1.5 }],
      ['61-char name', { name: 'x'.repeat(61) }],
      ['empty name', { name: '  ' }],
      ['1001-char notes', { notes: 'x'.repeat(1001) }],
      ['bad location', { location: 'garage' }],
      ['future lastWateredAt', { lastWateredAt: new Date(Date.now() + 86_400_000).toISOString() }],
    ])('rejects %s with 400', async (_label, override) => {
      const res = await call(t.app, 'POST', `/api/groups/${aliceGroup}/plants`, {
        cookie: alice.cookie,
        payload: { name: 'Fern', intervalDays: 3, location: 'inside', ...override },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 to a non-member and 403 to a caretaker', async () => {
      const shared = await createSharedGroup(t.prisma, alice.user.id);
      const asStranger = await call(t.app, 'POST', `/api/groups/${shared}/plants`, {
        cookie: bob.cookie,
        payload: { name: 'X', intervalDays: 1, location: 'inside' },
      });
      expect(asStranger.statusCode).toBe(404);

      await addMember(t.prisma, shared, bob.user.id);
      const asCaretaker = await call(t.app, 'POST', `/api/groups/${shared}/plants`, {
        cookie: bob.cookie,
        payload: { name: 'X', intervalDays: 1, location: 'inside' },
      });
      expect(asCaretaker.statusCode).toBe(403);
    });
  });

  describe('GET /api/plants/:id', () => {
    it('returns the plant to a member and 404 to a non-member', async () => {
      const plant = await createPlantViaApi(t.app, alice.cookie, aliceGroup);
      const own = await call(t.app, 'GET', `/api/plants/${plant.id}`, { cookie: alice.cookie });
      expect(own.statusCode).toBe(200);
      expect(own.json<{ plant: PlantJson }>().plant.id).toBe(plant.id);

      const other = await call(t.app, 'GET', `/api/plants/${plant.id}`, { cookie: bob.cookie });
      expect(other.statusCode).toBe(404);
      expect(other.body).not.toContain(plant.name);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await call(t.app, 'GET', '/api/plants/does-not-exist', { cookie: alice.cookie });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/plants/:id', () => {
    it('updates fields, increments version, and emits plant:updated', async () => {
      const plant = await createPlantViaApi(t.app, alice.cookie, aliceGroup);
      t.emitter.clear();
      const res = await call(t.app, 'PATCH', `/api/plants/${plant.id}`, {
        cookie: alice.cookie,
        payload: { name: 'Boston Fern', location: 'outside', intervalDays: 4 },
      });
      expect(res.statusCode).toBe(200);
      const updated = res.json<{ plant: PlantJson }>().plant;
      expect(updated).toMatchObject({ name: 'Boston Fern', location: 'outside', intervalDays: 4 });
      expect(updated.version).toBe(plant.version + 1);
      expect(t.emitter.events('plant:updated')).toHaveLength(1);
    });

    it('lets a caretaker change location and notes but not name or interval', async () => {
      const shared = await createSharedGroup(t.prisma, alice.user.id, 'Patio');
      await addMember(t.prisma, shared, bob.user.id);
      const plant = await createPlantViaApi(t.app, alice.cookie, shared);

      const care = await call(t.app, 'PATCH', `/api/plants/${plant.id}`, {
        cookie: bob.cookie,
        payload: { location: 'outside', notes: 'moved' },
      });
      expect(care.statusCode).toBe(200);

      for (const payload of [{ name: 'Renamed' }, { intervalDays: 9 }]) {
        const core = await call(t.app, 'PATCH', `/api/plants/${plant.id}`, {
          cookie: bob.cookie,
          payload,
        });
        expect(core.statusCode).toBe(403);
      }
    });

    it('returns 404 to a non-member and 400 for an empty body', async () => {
      const plant = await createPlantViaApi(t.app, alice.cookie, aliceGroup);
      const stranger = await call(t.app, 'PATCH', `/api/plants/${plant.id}`, {
        cookie: bob.cookie,
        payload: { location: 'outside' },
      });
      expect(stranger.statusCode).toBe(404);
      const empty = await call(t.app, 'PATCH', `/api/plants/${plant.id}`, {
        cookie: alice.cookie,
        payload: {},
      });
      expect(empty.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/plants/:id', () => {
    it('deletes for the owner and emits plant:deleted', async () => {
      const plant = await createPlantViaApi(t.app, alice.cookie, aliceGroup);
      t.emitter.clear();
      const res = await call(t.app, 'DELETE', `/api/plants/${plant.id}`, { cookie: alice.cookie });
      expect(res.statusCode).toBe(204);
      expect(await t.prisma.plant.findUnique({ where: { id: plant.id } })).toBeNull();
      expect(t.emitter.events('plant:deleted')[0]?.payload).toEqual({
        plantId: plant.id,
        groupId: aliceGroup,
      });
    });

    it('returns 404 to a non-member and 403 to a caretaker', async () => {
      const shared = await createSharedGroup(t.prisma, alice.user.id, 'Porch');
      const plant = await createPlantViaApi(t.app, alice.cookie, shared);
      expect(
        (await call(t.app, 'DELETE', `/api/plants/${plant.id}`, { cookie: bob.cookie })).statusCode,
      ).toBe(404);
      await addMember(t.prisma, shared, bob.user.id);
      expect(
        (await call(t.app, 'DELETE', `/api/plants/${plant.id}`, { cookie: bob.cookie })).statusCode,
      ).toBe(403);
    });
  });

  it('every plant route returns 401 when signed out', async () => {
    const plant = await createPlantViaApi(t.app, alice.cookie, aliceGroup);
    const body = { name: 'X', intervalDays: 1, location: 'inside' };
    expect(
      (await call(t.app, 'POST', `/api/groups/${aliceGroup}/plants`, { payload: body })).statusCode,
    ).toBe(401);
    expect((await call(t.app, 'GET', `/api/plants/${plant.id}`)).statusCode).toBe(401);
    expect(
      (await call(t.app, 'PATCH', `/api/plants/${plant.id}`, { payload: { name: 'Y' } }))
        .statusCode,
    ).toBe(401);
    expect((await call(t.app, 'DELETE', `/api/plants/${plant.id}`)).statusCode).toBe(401);
  });
});
