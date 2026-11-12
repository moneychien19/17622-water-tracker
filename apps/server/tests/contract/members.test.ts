import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addMember,
  call,
  createPlantViaApi,
  createSharedGroup,
  createUserAndLogin,
  setupTestApp,
  type LoggedInUser,
  type TestApp,
} from '../helpers/app';

interface MemberJson {
  userId: string;
  displayName: string;
  email: string;
  role: string;
}

describe('member routes', () => {
  let t: TestApp;
  let alice: LoggedInUser;
  let bob: LoggedInUser;
  let carol: LoggedInUser;
  let dave: LoggedInUser;

  beforeAll(async () => {
    t = await setupTestApp();
    alice = await createUserAndLogin(t.app, { displayName: 'Alice' });
    bob = await createUserAndLogin(t.app, { displayName: 'Bob' });
    carol = await createUserAndLogin(t.app, { displayName: 'Carol' });
    dave = await createUserAndLogin(t.app, { displayName: 'Dave' });
  });
  afterAll(async () => {
    await t.teardown();
  });
  beforeEach(() => {
    t.emitter.clear();
  });

  async function groupWithBobAndDave() {
    const groupId = await createSharedGroup(t.prisma, alice.user.id);
    await addMember(t.prisma, groupId, bob.user.id);
    await addMember(t.prisma, groupId, dave.user.id);
    return groupId;
  }

  const remove = (cookie: string, groupId: string, userId: string) =>
    call(t.app, 'DELETE', `/api/groups/${groupId}/members/${userId}`, { cookie });

  it('GET members: 200 for members, 404 for non-members', async () => {
    const groupId = await groupWithBobAndDave();
    const res = await call(t.app, 'GET', `/api/groups/${groupId}/members`, { cookie: bob.cookie });
    expect(res.statusCode).toBe(200);
    const { members } = res.json<{ members: MemberJson[] }>();
    expect(members.map((m) => [m.displayName, m.role])).toEqual([
      ['Alice', 'owner'],
      ['Bob', 'caretaker'],
      ['Dave', 'caretaker'],
    ]);
    expect(
      (await call(t.app, 'GET', `/api/groups/${groupId}/members`, { cookie: carol.cookie }))
        .statusCode,
    ).toBe(404);
  });

  it('owner removes a caretaker: 204, eviction, and events', async () => {
    const groupId = await groupWithBobAndDave();
    const plant = await createPlantViaApi(t.app, alice.cookie, groupId);
    t.emitter.clear();

    expect((await remove(alice.cookie, groupId, bob.user.id)).statusCode).toBe(204);
    expect(t.emitter.calls).toContainEqual({ kind: 'leaveGroup', userId: bob.user.id, groupId });
    expect(t.emitter.events('group:access-revoked')[0]).toMatchObject({
      kind: 'toUser',
      target: bob.user.id,
      payload: { groupId },
    });
    expect(t.emitter.events('group:member-left')[0]).toMatchObject({
      kind: 'toGroup',
      target: groupId,
      payload: { groupId, userId: bob.user.id },
    });

    // Removed user loses access immediately.
    expect(
      (await call(t.app, 'GET', `/api/plants/${plant.id}`, { cookie: bob.cookie })).statusCode,
    ).toBe(404);
  });

  it('a caretaker can leave (remove self)', async () => {
    const groupId = await groupWithBobAndDave();
    expect((await remove(bob.cookie, groupId, bob.user.id)).statusCode).toBe(204);
  });

  it('a caretaker cannot remove someone else (403)', async () => {
    const groupId = await groupWithBobAndDave();
    expect((await remove(bob.cookie, groupId, dave.user.id)).statusCode).toBe(403);
  });

  it('removing the owner returns 409, including the owner removing themselves', async () => {
    const groupId = await groupWithBobAndDave();
    expect((await remove(alice.cookie, groupId, alice.user.id)).statusCode).toBe(409);
    expect((await remove(bob.cookie, groupId, alice.user.id)).statusCode).toBe(409);
  });

  it('non-members get 404; unknown target gets 404', async () => {
    const groupId = await groupWithBobAndDave();
    expect((await remove(carol.cookie, groupId, bob.user.id)).statusCode).toBe(404);
    expect((await remove(alice.cookie, groupId, carol.user.id)).statusCode).toBe(404);
  });

  it('every member route returns 401 when signed out', async () => {
    const groupId = await groupWithBobAndDave();
    expect((await call(t.app, 'GET', `/api/groups/${groupId}/members`)).statusCode).toBe(401);
    expect(
      (await call(t.app, 'DELETE', `/api/groups/${groupId}/members/${bob.user.id}`)).statusCode,
    ).toBe(401);
  });
});
