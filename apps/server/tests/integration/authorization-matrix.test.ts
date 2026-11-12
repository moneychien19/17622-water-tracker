import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

/**
 * SC-005: table-driven over every group-scoped route in contracts/rest-api.md.
 * Non-members always get 404 with no group/plant details; caretakers get 403 on owner routes.
 */
describe('authorization matrix', () => {
  let t: TestApp;
  let owner: LoggedInUser;
  let caretaker: LoggedInUser;
  let stranger: LoggedInUser;
  let groupId: string;
  let plant: PlantJson;
  let wateringId: string;
  let invitationId: string;

  beforeAll(async () => {
    t = await setupTestApp();
    owner = await createUserAndLogin(t.app, { displayName: 'Owner' });
    caretaker = await createUserAndLogin(t.app, { displayName: 'Caretaker' });
    stranger = await createUserAndLogin(t.app, { displayName: 'Stranger' });
    groupId = await createSharedGroup(t.prisma, owner.user.id, 'Secret Garden');
    await addMember(t.prisma, groupId, caretaker.user.id);
    plant = await createPlantViaApi(t.app, owner.cookie, groupId, { name: 'Moonflower' });
    const w = await call(t.app, 'POST', `/api/plants/${plant.id}/waterings`, {
      cookie: owner.cookie,
    });
    wateringId = w.json<{ watering: { id: string } }>().watering.id;
    const inv = await call(t.app, 'POST', `/api/groups/${groupId}/invitations`, {
      cookie: owner.cookie,
      payload: { email: 'someone@example.com' },
    });
    invitationId = inv.json<{ invitation: { id: string } }>().invitation.id;
  });
  afterAll(async () => {
    await t.teardown();
  });

  type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
  interface RouteCase {
    name: string;
    method: Method;
    url: () => string;
    payload?: object;
    ownerOnly: boolean;
  }

  // Non-destructive requests only (destructive owner actions are covered in contract tests).
  const routes: RouteCase[] = [
    {
      name: 'view group members',
      method: 'GET',
      url: () => `/api/groups/${groupId}/members`,
      ownerOnly: false,
    },
    {
      name: 'rename group',
      method: 'PATCH',
      url: () => `/api/groups/${groupId}`,
      payload: { name: 'X' },
      ownerOnly: true,
    },
    {
      name: 'delete group',
      method: 'DELETE',
      url: () => `/api/groups/${groupId}`,
      ownerOnly: true,
    },
    {
      name: 'list invitations',
      method: 'GET',
      url: () => `/api/groups/${groupId}/invitations`,
      ownerOnly: true,
    },
    {
      name: 'invite',
      method: 'POST',
      url: () => `/api/groups/${groupId}/invitations`,
      payload: { email: 'x@example.com' },
      ownerOnly: true,
    },
    {
      name: 'revoke invitation',
      method: 'DELETE',
      url: () => `/api/invitations/${invitationId}`,
      ownerOnly: true,
    },
    {
      name: 'remove owner-only member',
      method: 'DELETE',
      url: () => `/api/groups/${groupId}/members/${owner.user.id}`,
      ownerOnly: false,
    },
    {
      name: 'create plant',
      method: 'POST',
      url: () => `/api/groups/${groupId}/plants`,
      payload: { name: 'X', intervalDays: 1, location: 'inside' },
      ownerOnly: true,
    },
    { name: 'view plant', method: 'GET', url: () => `/api/plants/${plant.id}`, ownerOnly: false },
    {
      name: 'rename plant',
      method: 'PATCH',
      url: () => `/api/plants/${plant.id}`,
      payload: { name: 'Renamed' },
      ownerOnly: true,
    },
    {
      name: 'change interval',
      method: 'PATCH',
      url: () => `/api/plants/${plant.id}`,
      payload: { intervalDays: 9 },
      ownerOnly: true,
    },
    {
      name: 'toggle location',
      method: 'PATCH',
      url: () => `/api/plants/${plant.id}`,
      payload: { location: 'outside' },
      ownerOnly: false,
    },
    {
      name: 'delete plant',
      method: 'DELETE',
      url: () => `/api/plants/${plant.id}`,
      ownerOnly: true,
    },
    {
      name: 'water plant',
      method: 'POST',
      url: () => `/api/plants/${plant.id}/waterings`,
      ownerOnly: false,
    },
    {
      name: 'view history',
      method: 'GET',
      url: () => `/api/plants/${plant.id}/waterings`,
      ownerOnly: false,
    },
    {
      name: 'undo watering',
      method: 'POST',
      url: () => `/api/waterings/${wateringId}/undo`,
      ownerOnly: false,
    },
  ];

  it.each(routes)('non-member → 404 without leaking details: $name', async (r) => {
    const res = await call(t.app, r.method, r.url(), {
      cookie: stranger.cookie,
      ...(r.payload ? { payload: r.payload } : {}),
    });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('Secret Garden');
    expect(res.body).not.toContain('Moonflower');
    expect(res.json()).toEqual({ error: 'Not found' });
  });

  it.each(routes.filter((r) => r.ownerOnly))('caretaker → 403: $name', async (r) => {
    const res = await call(t.app, r.method, r.url(), {
      cookie: caretaker.cookie,
      ...(r.payload ? { payload: r.payload } : {}),
    });
    expect(res.statusCode).toBe(403);
  });

  it('caretaker can toggle location and edit notes', async () => {
    const res = await call(t.app, 'PATCH', `/api/plants/${plant.id}`, {
      cookie: caretaker.cookie,
      payload: { location: 'outside', notes: 'on the porch' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('caretaker cannot change interval even alongside allowed fields', async () => {
    const res = await call(t.app, 'PATCH', `/api/plants/${plant.id}`, {
      cookie: caretaker.cookie,
      payload: { location: 'inside', intervalDays: 2 },
    });
    expect(res.statusCode).toBe(403);
  });

  it('the dashboard of a non-member never contains the group plants', async () => {
    const res = await call(t.app, 'GET', '/api/dashboard', { cookie: stranger.cookie });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(plant.id);
  });
});
