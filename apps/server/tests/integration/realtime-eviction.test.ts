import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addMember,
  call,
  createPlantViaApi,
  createSharedGroup,
  createUserAndLogin,
  type LoggedInUser,
} from '../helpers/app';
import {
  collect,
  delay,
  setupRealtimeTestApp,
  waitForConnect,
  waitForEvent,
  type RealtimeTestApp,
} from '../helpers/realtime';

describe('real-time room membership changes', () => {
  let t: RealtimeTestApp;
  let alice: LoggedInUser;
  let bob: LoggedInUser;

  beforeAll(async () => {
    t = await setupRealtimeTestApp();
    alice = await createUserAndLogin(t.app, { displayName: 'Alice' });
    bob = await createUserAndLogin(t.app, { displayName: 'Bob' });
  });
  afterAll(async () => {
    await t.teardown();
  });

  it('a removed member gets access-revoked and no further group events', async () => {
    const groupId = await createSharedGroup(t.prisma, alice.user.id);
    await addMember(t.prisma, groupId, bob.user.id);
    const plant = await createPlantViaApi(t.app, alice.cookie, groupId);
    const bobSocket = t.connectAs(bob.cookie);
    await waitForConnect(bobSocket);

    const revoked = waitForEvent(bobSocket, 'group:access-revoked');
    await call(t.app, 'DELETE', `/api/groups/${groupId}/members/${bob.user.id}`, {
      cookie: alice.cookie,
    });
    expect(await revoked).toEqual({ groupId });

    const after = collect(bobSocket, 'plant:watered');
    await call(t.app, 'POST', `/api/plants/${plant.id}/waterings`, { cookie: alice.cookie });
    await delay(1000);
    expect(after).toHaveLength(0);
  });

  it('an accepted invitation joins existing sockets to the group room without reconnecting', async () => {
    const groupId = await createSharedGroup(t.prisma, alice.user.id, 'Patio');
    const bobSocket = t.connectAs(bob.cookie);
    await waitForConnect(bobSocket);

    const received = waitForEvent(bobSocket, 'invitation:received');
    const inv = await call(t.app, 'POST', `/api/groups/${groupId}/invitations`, {
      cookie: alice.cookie,
      payload: { email: bob.user.email },
    });
    const invitationId = inv.json<{ invitation: { id: string } }>().invitation.id;
    expect((await received).invitation.id).toBe(invitationId);

    const aliceSocket = t.connectAs(alice.cookie);
    await waitForConnect(aliceSocket);
    const joined = waitForEvent(aliceSocket, 'group:member-joined');
    await call(t.app, 'POST', `/api/invitations/${invitationId}/accept`, { cookie: bob.cookie });
    expect((await joined).member.userId).toBe(bob.user.id);

    const created = waitForEvent(bobSocket, 'plant:created');
    await createPlantViaApi(t.app, alice.cookie, groupId, { name: 'Lavender' });
    expect((await created).plant.name).toBe('Lavender');
  });

  it('logout disconnects the user sockets', async () => {
    const carol = await createUserAndLogin(t.app, { displayName: 'Carol' });
    const socket = t.connectAs(carol.cookie);
    await waitForConnect(socket);
    const disconnected = new Promise<string>((resolve) => socket.once('disconnect', resolve));
    await call(t.app, 'POST', '/api/auth/logout', { cookie: carol.cookie });
    expect(await disconnected).toBe('io server disconnect');
  });

  it('group delete emits group:deleted, then removes everyone from the room', async () => {
    const groupId = await createSharedGroup(t.prisma, alice.user.id, 'Doomed');
    await addMember(t.prisma, groupId, bob.user.id);
    const bobSocket = t.connectAs(bob.cookie);
    await waitForConnect(bobSocket);

    const deleted = waitForEvent(bobSocket, 'group:deleted');
    await call(t.app, 'DELETE', `/api/groups/${groupId}`, { cookie: alice.cookie });
    expect(await deleted).toEqual({ groupId });
    expect(await t.emitter.io.in(`group:${groupId}`).fetchSockets()).toHaveLength(0);
  });
});
