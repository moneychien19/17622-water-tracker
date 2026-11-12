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

describe('GET /api/dashboard', () => {
  let t: TestApp;
  let alice: LoggedInUser;
  let bob: LoggedInUser;

  beforeAll(async () => {
    t = await setupTestApp();
    alice = await createUserAndLogin(t.app, { displayName: 'Alice' });
    bob = await createUserAndLogin(t.app, { displayName: 'Bob' });
  });
  afterAll(async () => {
    await t.teardown();
  });

  it('returns plants from all caller groups with derived fields, excluding others', async () => {
    const alicePersonal = await personalGroupId(t.prisma, alice.user.id);
    const bobPersonal = await personalGroupId(t.prisma, bob.user.id);
    const balcony = await createSharedGroup(t.prisma, bob.user.id, 'Balcony');
    await addMember(t.prisma, balcony, alice.user.id);

    const fern = await createPlantViaApi(t.app, alice.cookie, alicePersonal, { name: 'Fern' });
    const tomato = await createPlantViaApi(t.app, bob.cookie, balcony, { name: 'Tomato' });
    const secret = await createPlantViaApi(t.app, bob.cookie, bobPersonal, { name: 'Secret' });
    await call(t.app, 'POST', `/api/plants/${tomato.id}/waterings`, { cookie: bob.cookie });

    const res = await call(t.app, 'GET', '/api/dashboard', { cookie: alice.cookie });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ plants: PlantJson[]; serverTime: string }>();
    expect(Number.isNaN(Date.parse(body.serverTime))).toBe(false);

    const ids = body.plants.map((p) => p.id).sort();
    expect(ids).toEqual([fern.id, tomato.id].sort());
    expect(res.body).not.toContain(secret.id);

    const t1 = body.plants.find((p) => p.id === tomato.id);
    expect(t1).toMatchObject({ groupName: 'Balcony', lastWatering: { byDisplayName: 'Bob' } });
    expect(t1?.nextDueAt).toBeTruthy();
    expect(body.plants.find((p) => p.id === fern.id)?.groupName).toBe('My Plants');
  });

  it('returns 401 when signed out', async () => {
    expect((await call(t.app, 'GET', '/api/dashboard')).statusCode).toBe(401);
  });
});
