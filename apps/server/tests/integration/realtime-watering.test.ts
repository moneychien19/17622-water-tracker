import { eventSchemas } from '@water/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addMember,
  call,
  createPlantViaApi,
  createSharedGroup,
  createUserAndLogin,
  type LoggedInUser,
  type PlantJson,
} from '../helpers/app';
import {
  collect,
  delay,
  setupRealtimeTestApp,
  waitForConnect,
  waitForEvent,
  type RealtimeTestApp,
} from '../helpers/realtime';

describe('real-time broadcast of plant changes', () => {
  let t: RealtimeTestApp;
  let alice: LoggedInUser;
  let bob: LoggedInUser;
  let carol: LoggedInUser;
  let groupId: string;

  beforeAll(async () => {
    t = await setupRealtimeTestApp();
    alice = await createUserAndLogin(t.app, { displayName: 'Alice' });
    bob = await createUserAndLogin(t.app, { displayName: 'Bob' });
    carol = await createUserAndLogin(t.app, { displayName: 'Carol' });
    groupId = await createSharedGroup(t.prisma, alice.user.id);
    await addMember(t.prisma, groupId, bob.user.id);
  });
  afterAll(async () => {
    await t.teardown();
  });

  it('delivers plant:watered to other members within 5s and nothing to non-members', async () => {
    const plant = await createPlantViaApi(t.app, alice.cookie, groupId, { name: 'Tomato' });
    const bobSocket = t.connectAs(bob.cookie);
    const carolSocket = t.connectAs(carol.cookie);
    await Promise.all([waitForConnect(bobSocket), waitForConnect(carolSocket)]);
    const carolGot = collect(carolSocket, 'plant:watered');

    const started = Date.now();
    const received = waitForEvent(bobSocket, 'plant:watered', 5000);
    await call(t.app, 'POST', `/api/plants/${plant.id}/waterings`, { cookie: alice.cookie });
    const payload = await received;
    expect(Date.now() - started).toBeLessThan(5000);

    const parsed = eventSchemas['plant:watered'].parse(payload);
    expect(parsed.plant.id).toBe(plant.id);
    expect(parsed.watering.wateredBy.displayName).toBe('Alice');

    await delay(1000);
    expect(carolGot).toHaveLength(0);
  });

  it('concurrent waterings both persist and every member converges on the same version', async () => {
    const plant = await createPlantViaApi(t.app, alice.cookie, groupId, { name: 'Basil' });
    const aliceSocket = t.connectAs(alice.cookie);
    const bobSocket = t.connectAs(bob.cookie);
    await Promise.all([waitForConnect(aliceSocket), waitForConnect(bobSocket)]);
    const aliceGot = collect(aliceSocket, 'plant:watered');
    const bobGot = collect(bobSocket, 'plant:watered');

    const [r1, r2] = await Promise.all([
      call(t.app, 'POST', `/api/plants/${plant.id}/waterings`, { cookie: alice.cookie }),
      call(t.app, 'POST', `/api/plants/${plant.id}/waterings`, { cookie: bob.cookie }),
    ]);
    expect([r1.statusCode, r2.statusCode]).toEqual([201, 201]);

    const deadline = Date.now() + 5000;
    while ((aliceGot.length < 2 || bobGot.length < 2) && Date.now() < deadline) await delay(50);
    expect(aliceGot).toHaveLength(2);
    expect(bobGot).toHaveLength(2);

    const finalVersion = (events: unknown[]) =>
      Math.max(...events.map((e) => eventSchemas['plant:watered'].parse(e).plant.version));
    expect(finalVersion(aliceGot)).toBe(plant.version + 2);
    expect(finalVersion(bobGot)).toBe(plant.version + 2);

    const history = await call(t.app, 'GET', `/api/plants/${plant.id}/waterings`, {
      cookie: alice.cookie,
    });
    expect(history.json<{ items: unknown[] }>().items).toHaveLength(2);
  });

  it('broadcasts plant:created, plant:updated, plant:watering-undone, and plant:deleted', async () => {
    const bobSocket = t.connectAs(bob.cookie);
    await waitForConnect(bobSocket);

    const created = waitForEvent(bobSocket, 'plant:created');
    const plant: PlantJson = await createPlantViaApi(t.app, alice.cookie, groupId, {
      name: 'Mint',
    });
    expect((await created).plant.id).toBe(plant.id);

    const updated = waitForEvent(bobSocket, 'plant:updated');
    await call(t.app, 'PATCH', `/api/plants/${plant.id}`, {
      cookie: alice.cookie,
      payload: { location: 'outside' },
    });
    expect((await updated).plant.location).toBe('outside');

    const watered = await call(t.app, 'POST', `/api/plants/${plant.id}/waterings`, {
      cookie: alice.cookie,
    });
    const wateringId = watered.json<{ watering: { id: string } }>().watering.id;
    const undone = waitForEvent(bobSocket, 'plant:watering-undone');
    await call(t.app, 'POST', `/api/waterings/${wateringId}/undo`, { cookie: alice.cookie });
    expect((await undone).wateringId).toBe(wateringId);

    const deleted = waitForEvent(bobSocket, 'plant:deleted');
    await call(t.app, 'DELETE', `/api/plants/${plant.id}`, { cookie: alice.cookie });
    expect(await deleted).toEqual({ plantId: plant.id, groupId });
  });
});
