import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addMember,
  call,
  createUserAndLogin,
  personalGroupId,
  setupTestApp,
  type LoggedInUser,
  type TestApp,
} from '../helpers/app';

interface GroupJson {
  id: string;
  name: string;
  isPersonal: boolean;
  role?: string;
}

describe('group routes', () => {
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

  it('GET /api/groups lists the caller groups with role', async () => {
    const res = await call(t.app, 'GET', '/api/groups', { cookie: alice.cookie });
    expect(res.statusCode).toBe(200);
    const { groups } = res.json<{ groups: GroupJson[] }>();
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ isPersonal: true, role: 'owner', name: 'My Plants' });
  });

  it('POST /api/groups creates a group owned by the caller', async () => {
    const res = await call(t.app, 'POST', '/api/groups', {
      cookie: alice.cookie,
      payload: { name: 'Balcony' },
    });
    expect(res.statusCode).toBe(201);
    const { group } = res.json<{ group: GroupJson }>();
    expect(group).toMatchObject({ name: 'Balcony', isPersonal: false });
    const list = await call(t.app, 'GET', '/api/groups', { cookie: alice.cookie });
    expect(list.json<{ groups: GroupJson[] }>().groups.find((g) => g.id === group.id)?.role).toBe(
      'owner',
    );
  });

  it('POST /api/groups rejects names outside 1–60 chars', async () => {
    for (const name of ['', 'x'.repeat(61)]) {
      const res = await call(t.app, 'POST', '/api/groups', {
        cookie: alice.cookie,
        payload: { name },
      });
      expect(res.statusCode).toBe(400);
    }
  });

  describe('PATCH /api/groups/:id', () => {
    it('lets the owner rename and emits group:updated', async () => {
      const groupId = (
        await call(t.app, 'POST', '/api/groups', { cookie: alice.cookie, payload: { name: 'Old' } })
      ).json<{ group: GroupJson }>().group.id;
      t.emitter.clear();
      const res = await call(t.app, 'PATCH', `/api/groups/${groupId}`, {
        cookie: alice.cookie,
        payload: { name: 'New' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ group: GroupJson }>().group.name).toBe('New');
      expect(t.emitter.events('group:updated')).toHaveLength(1);
    });

    it('returns 404 to a non-member', async () => {
      const groupId = await personalGroupId(t.prisma, alice.user.id);
      const res = await call(t.app, 'PATCH', `/api/groups/${groupId}`, {
        cookie: bob.cookie,
        payload: { name: 'Hacked' },
      });
      expect(res.statusCode).toBe(404);
      expect(res.body).not.toContain('My Plants');
    });

    it('returns 403 to a caretaker', async () => {
      const groupId = (
        await call(t.app, 'POST', '/api/groups', { cookie: alice.cookie, payload: { name: 'G' } })
      ).json<{ group: GroupJson }>().group.id;
      await addMember(t.prisma, groupId, bob.user.id);
      const res = await call(t.app, 'PATCH', `/api/groups/${groupId}`, {
        cookie: bob.cookie,
        payload: { name: 'Nope' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('DELETE /api/groups/:id', () => {
    it('lets the owner delete a shared group, emits group:deleted then evicts', async () => {
      const groupId = (
        await call(t.app, 'POST', '/api/groups', { cookie: alice.cookie, payload: { name: 'Tmp' } })
      ).json<{ group: GroupJson }>().group.id;
      t.emitter.clear();
      const res = await call(t.app, 'DELETE', `/api/groups/${groupId}`, { cookie: alice.cookie });
      expect(res.statusCode).toBe(204);
      expect(await t.prisma.group.findUnique({ where: { id: groupId } })).toBeNull();
      expect(t.emitter.calls.map((c) => c.kind)).toEqual(['toGroup', 'evictGroup']);
    });

    it('returns 409 for the personal group', async () => {
      const groupId = await personalGroupId(t.prisma, alice.user.id);
      const res = await call(t.app, 'DELETE', `/api/groups/${groupId}`, { cookie: alice.cookie });
      expect(res.statusCode).toBe(409);
    });

    it('returns 404 to a non-member', async () => {
      const groupId = await personalGroupId(t.prisma, alice.user.id);
      const res = await call(t.app, 'DELETE', `/api/groups/${groupId}`, { cookie: bob.cookie });
      expect(res.statusCode).toBe(404);
    });
  });

  it('every group route returns 401 when signed out', async () => {
    const groupId = await personalGroupId(t.prisma, alice.user.id);
    expect((await call(t.app, 'GET', '/api/groups')).statusCode).toBe(401);
    expect((await call(t.app, 'POST', '/api/groups', { payload: { name: 'x' } })).statusCode).toBe(
      401,
    );
    expect(
      (await call(t.app, 'PATCH', `/api/groups/${groupId}`, { payload: { name: 'x' } })).statusCode,
    ).toBe(401);
    expect((await call(t.app, 'DELETE', `/api/groups/${groupId}`)).statusCode).toBe(401);
  });
});
