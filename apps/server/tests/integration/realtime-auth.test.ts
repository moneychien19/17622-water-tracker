import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createSharedGroup,
  createUserAndLogin,
  personalGroupId,
  type LoggedInUser,
} from '../helpers/app';
import {
  setupRealtimeTestApp,
  waitForConnect,
  waitForConnectError,
  type RealtimeTestApp,
} from '../helpers/realtime';

describe('Socket.IO handshake authorization', () => {
  let t: RealtimeTestApp;
  let alice: LoggedInUser;

  beforeAll(async () => {
    t = await setupRealtimeTestApp();
    alice = await createUserAndLogin(t.app, { displayName: 'Alice' });
  });
  afterAll(async () => {
    await t.teardown();
  });

  it('rejects a connection without a cookie', async () => {
    const err = await waitForConnectError(t.connectAs());
    expect(err.message).toBe('unauthorized');
  });

  it('rejects an invalid session cookie', async () => {
    const err = await waitForConnectError(t.connectAs('sid=forged-token'));
    expect(err.message).toBe('unauthorized');
  });

  it('joins the user room and every group room the user belongs to', async () => {
    const personal = await personalGroupId(t.prisma, alice.user.id);
    const shared = await createSharedGroup(t.prisma, alice.user.id);
    const other = await createSharedGroup(t.prisma, (await createUserAndLogin(t.app)).user.id);

    const socket = t.connectAs(alice.cookie);
    await waitForConnect(socket);

    const io = t.emitter.io;
    const ids = async (room: string) => (await io.in(room).fetchSockets()).map((s) => s.id);
    expect(await ids(`user:${alice.user.id}`)).toContain(socket.id);
    expect(await ids(`group:${personal}`)).toContain(socket.id);
    expect(await ids(`group:${shared}`)).toContain(socket.id);
    expect(await ids(`group:${other}`)).not.toContain(socket.id);
  });
});
