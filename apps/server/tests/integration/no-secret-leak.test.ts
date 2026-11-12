import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  call,
  createPlantViaApi,
  createSharedGroup,
  createUserAndLogin,
  setupTestApp,
  type LoggedInUser,
  type TestApp,
} from '../helpers/app';

/** No response body may contain password hashes or session tokens (Constitution IV). */
describe('no secrets in API responses', () => {
  let t: TestApp;
  let alice: LoggedInUser;
  let bob: LoggedInUser;
  let groupId: string;
  let plantId: string;
  let invitationId: string;
  let wateringId: string;
  const bodies: string[] = [];

  beforeAll(async () => {
    t = await setupTestApp();
    alice = await createUserAndLogin(t.app, { displayName: 'Alice' });
    bob = await createUserAndLogin(t.app, { displayName: 'Bob' });
    groupId = await createSharedGroup(t.prisma, alice.user.id);
    plantId = (await createPlantViaApi(t.app, alice.cookie, groupId)).id;
    const inv = await call(t.app, 'POST', `/api/groups/${groupId}/invitations`, {
      cookie: alice.cookie,
      payload: { email: bob.user.email },
    });
    bodies.push(inv.body);
    invitationId = inv.json<{ invitation: { id: string } }>().invitation.id;
    const w = await call(t.app, 'POST', `/api/plants/${plantId}/waterings`, {
      cookie: alice.cookie,
    });
    bodies.push(w.body);
    wateringId = w.json<{ watering: { id: string } }>().watering.id;
  });
  afterAll(async () => {
    await t.teardown();
  });

  it('every GET and POST response body is free of passwordHash, sid, and raw tokens', async () => {
    const reqs: [
      method: 'GET' | 'POST' | 'PATCH',
      url: string,
      cookie: string,
      payload?: object,
    ][] = [
      ['GET', '/api/auth/me', alice.cookie],
      ['GET', '/api/dashboard', alice.cookie],
      ['GET', '/api/groups', alice.cookie],
      ['GET', `/api/groups/${groupId}/members`, alice.cookie],
      ['GET', `/api/groups/${groupId}/invitations`, alice.cookie],
      ['GET', '/api/me/invitations', bob.cookie],
      ['GET', `/api/plants/${plantId}`, alice.cookie],
      ['GET', `/api/plants/${plantId}/waterings`, alice.cookie],
      ['PATCH', `/api/plants/${plantId}`, alice.cookie, { notes: 'n' }],
      ['POST', '/api/groups', alice.cookie, { name: 'Another' }],
      ['POST', `/api/waterings/${wateringId}/undo`, alice.cookie],
      ['POST', `/api/invitations/${invitationId}/accept`, bob.cookie],
      [
        'POST',
        '/api/auth/login',
        '',
        { email: alice.user.email, password: 'correct horse battery' },
      ],
    ];
    for (const [method, url, cookie, payload] of reqs) {
      const res = await call(t.app, method, url, {
        ...(cookie ? { cookie } : {}),
        ...(payload ? { payload } : {}),
      });
      expect(res.statusCode, `${method} ${url}`).toBeLessThan(400);
      bodies.push(res.body);
    }
    bodies.push(
      (
        await call(t.app, 'POST', '/api/auth/register', {
          payload: {
            email: 'new-user@example.com',
            password: 'correct horse battery',
            displayName: 'New',
            timeZone: 'UTC',
          },
        })
      ).body,
    );

    const tokens = [alice.cookie, bob.cookie].map((c) => c.replace(/^sid=/, ''));
    for (const body of bodies) {
      expect(body).not.toMatch(/passwordHash/i);
      expect(body).not.toMatch(/\$argon2/);
      expect(body).not.toMatch(/"sid"/);
      for (const token of tokens) expect(body).not.toContain(token);
    }
  });
});
