import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addMember,
  call,
  createSharedGroup,
  createUserAndLogin,
  personalGroupId,
  setupTestApp,
  type LoggedInUser,
  type TestApp,
} from '../helpers/app';

interface InvitationJson {
  id: string;
  groupId: string;
  email: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  groupName?: string;
  invitedByName?: string;
}

describe('invitation routes', () => {
  let t: TestApp;
  let alice: LoggedInUser;
  let bob: LoggedInUser;
  let carol: LoggedInUser;

  beforeAll(async () => {
    t = await setupTestApp();
    alice = await createUserAndLogin(t.app, { displayName: 'Alice' });
    bob = await createUserAndLogin(t.app, { displayName: 'Bob' });
    carol = await createUserAndLogin(t.app, { displayName: 'Carol' });
  });
  afterAll(async () => {
    await t.teardown();
  });
  beforeEach(() => {
    t.clock.real();
    t.emitter.clear();
  });

  const invite = (cookie: string, groupId: string, email: string) =>
    call(t.app, 'POST', `/api/groups/${groupId}/invitations`, { cookie, payload: { email } });

  describe('POST /api/groups/:id/invitations', () => {
    it('lets the owner invite with a 7-day expiry and notifies a registered invitee', async () => {
      const groupId = await createSharedGroup(t.prisma, alice.user.id);
      const res = await invite(alice.cookie, groupId, bob.user.email.toUpperCase());
      expect(res.statusCode).toBe(201);
      const { invitation } = res.json<{ invitation: InvitationJson }>();
      expect(invitation.email).toBe(bob.user.email);
      expect(invitation.status).toBe('pending');
      const ttl = Date.parse(invitation.expiresAt) - Date.parse(invitation.createdAt);
      expect(ttl).toBe(7 * 24 * 60 * 60 * 1000);
      expect(t.emitter.events('invitation:received')[0]).toMatchObject({
        kind: 'toUser',
        target: bob.user.id,
      });
    });

    it('returns 409 for an existing member, a duplicate pending invite, or a personal group', async () => {
      const groupId = await createSharedGroup(t.prisma, alice.user.id);
      await addMember(t.prisma, groupId, carol.user.id);
      expect((await invite(alice.cookie, groupId, carol.user.email)).statusCode).toBe(409);
      expect((await invite(alice.cookie, groupId, alice.user.email)).statusCode).toBe(409);

      expect((await invite(alice.cookie, groupId, 'new@example.com')).statusCode).toBe(201);
      expect((await invite(alice.cookie, groupId, 'new@example.com')).statusCode).toBe(409);

      const personal = await personalGroupId(t.prisma, alice.user.id);
      expect((await invite(alice.cookie, personal, 'x@example.com')).statusCode).toBe(409);
    });

    it('returns 403 to a caretaker, 404 to a non-member, 400 for a bad email', async () => {
      const groupId = await createSharedGroup(t.prisma, alice.user.id);
      await addMember(t.prisma, groupId, bob.user.id);
      expect((await invite(bob.cookie, groupId, 'z@example.com')).statusCode).toBe(403);
      expect((await invite(carol.cookie, groupId, 'z@example.com')).statusCode).toBe(404);
      expect((await invite(alice.cookie, groupId, 'not-an-email')).statusCode).toBe(400);
    });
  });

  describe('GET /api/groups/:id/invitations and DELETE /api/invitations/:id', () => {
    it('lists for the owner only, and revoke sets status revoked', async () => {
      const groupId = await createSharedGroup(t.prisma, alice.user.id);
      await addMember(t.prisma, groupId, bob.user.id);
      const inv = (await invite(alice.cookie, groupId, 'pending@example.com')).json<{
        invitation: InvitationJson;
      }>().invitation;

      const list = await call(t.app, 'GET', `/api/groups/${groupId}/invitations`, {
        cookie: alice.cookie,
      });
      expect(list.statusCode).toBe(200);
      expect(list.json<{ invitations: InvitationJson[] }>().invitations.map((i) => i.id)).toEqual([
        inv.id,
      ]);
      expect(
        (await call(t.app, 'GET', `/api/groups/${groupId}/invitations`, { cookie: bob.cookie }))
          .statusCode,
      ).toBe(403);
      expect(
        (await call(t.app, 'GET', `/api/groups/${groupId}/invitations`, { cookie: carol.cookie }))
          .statusCode,
      ).toBe(404);

      expect(
        (await call(t.app, 'DELETE', `/api/invitations/${inv.id}`, { cookie: bob.cookie }))
          .statusCode,
      ).toBe(403);
      expect(
        (await call(t.app, 'DELETE', `/api/invitations/${inv.id}`, { cookie: carol.cookie }))
          .statusCode,
      ).toBe(404);
      const del = await call(t.app, 'DELETE', `/api/invitations/${inv.id}`, {
        cookie: alice.cookie,
      });
      expect(del.statusCode).toBe(204);
      const stored = await t.prisma.invitation.findUniqueOrThrow({ where: { id: inv.id } });
      expect(stored.status).toBe('revoked');
    });
  });

  describe('GET /api/me/invitations', () => {
    it('lists pending, unexpired invitations, including ones sent before registration', async () => {
      const email = `later-${randomUUID()}@example.com`;
      const groupId = await createSharedGroup(t.prisma, alice.user.id, 'Greenhouse');
      await invite(alice.cookie, groupId, email);
      const expiredGroup = await createSharedGroup(t.prisma, alice.user.id, 'Old');
      await t.prisma.invitation.create({
        data: {
          groupId: expiredGroup,
          email,
          invitedById: alice.user.id,
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      const dave = await createUserAndLogin(t.app, { email, displayName: 'Dave' });
      const res = await call(t.app, 'GET', '/api/me/invitations', { cookie: dave.cookie });
      expect(res.statusCode).toBe(200);
      const { invitations } = res.json<{ invitations: InvitationJson[] }>();
      expect(invitations).toHaveLength(1);
      expect(invitations[0]).toMatchObject({
        groupId,
        groupName: 'Greenhouse',
        invitedByName: 'Alice',
        status: 'pending',
      });
    });
  });

  describe('accept / decline', () => {
    it('accept creates a caretaker membership, joins the room, and emits member-joined', async () => {
      const groupId = await createSharedGroup(t.prisma, alice.user.id, 'Patio');
      const inv = (await invite(alice.cookie, groupId, bob.user.email)).json<{
        invitation: InvitationJson;
      }>().invitation;

      expect(
        (await call(t.app, 'POST', `/api/invitations/${inv.id}/accept`, { cookie: carol.cookie }))
          .statusCode,
      ).toBe(404);

      t.emitter.clear();
      const res = await call(t.app, 'POST', `/api/invitations/${inv.id}/accept`, {
        cookie: bob.cookie,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ group: { id: string } }>().group.id).toBe(groupId);
      const m = await t.prisma.membership.findUniqueOrThrow({
        where: { groupId_userId: { groupId, userId: bob.user.id } },
      });
      expect(m.role).toBe('caretaker');
      expect(t.emitter.calls).toContainEqual({
        kind: 'joinGroup',
        userId: bob.user.id,
        groupId,
      });
      expect(t.emitter.events('group:member-joined')).toHaveLength(1);

      // Accepting again: no longer pending.
      expect(
        (await call(t.app, 'POST', `/api/invitations/${inv.id}/accept`, { cookie: bob.cookie }))
          .statusCode,
      ).toBe(409);
    });

    it('accept returns 409 when expired', async () => {
      const groupId = await createSharedGroup(t.prisma, alice.user.id);
      const inv = (await invite(alice.cookie, groupId, carol.user.email)).json<{
        invitation: InvitationJson;
      }>().invitation;
      t.clock.set(new Date(Date.parse(inv.expiresAt) + 1000));
      // Keep Carol's session valid at the future time by logging in at that time.
      const login = await call(t.app, 'POST', '/api/auth/login', {
        payload: { email: carol.user.email, password: 'correct horse battery' },
      });
      const cookie = String(login.headers['set-cookie']).split(';')[0] ?? '';
      const res = await call(t.app, 'POST', `/api/invitations/${inv.id}/accept`, { cookie });
      expect(res.statusCode).toBe(409);
    });

    it('decline returns 204 and is limited to the invitee', async () => {
      const groupId = await createSharedGroup(t.prisma, alice.user.id);
      const inv = (await invite(alice.cookie, groupId, carol.user.email)).json<{
        invitation: InvitationJson;
      }>().invitation;
      expect(
        (await call(t.app, 'POST', `/api/invitations/${inv.id}/decline`, { cookie: bob.cookie }))
          .statusCode,
      ).toBe(404);
      const res = await call(t.app, 'POST', `/api/invitations/${inv.id}/decline`, {
        cookie: carol.cookie,
      });
      expect(res.statusCode).toBe(204);
      const stored = await t.prisma.invitation.findUniqueOrThrow({ where: { id: inv.id } });
      expect(stored.status).toBe('declined');
    });
  });

  it('every invitation route returns 401 when signed out', async () => {
    const groupId = await createSharedGroup(t.prisma, alice.user.id);
    const requests: [method: 'GET' | 'POST' | 'DELETE', url: string][] = [
      ['GET', `/api/groups/${groupId}/invitations`],
      ['POST', `/api/groups/${groupId}/invitations`],
      ['DELETE', '/api/invitations/x'],
      ['GET', '/api/me/invitations'],
      ['POST', '/api/invitations/x/accept'],
      ['POST', '/api/invitations/x/decline'],
    ];
    for (const [method, url] of requests) {
      expect((await call(t.app, method, url)).statusCode, `${method} ${url}`).toBe(401);
    }
  });
});
