import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  call,
  createUserAndLogin,
  sessionCookieFrom,
  setupTestApp,
  type TestApp,
} from '../helpers/app';

const validBody = {
  email: 'Alice@Example.com',
  password: 'correct horse battery',
  displayName: '  Alice ',
  timeZone: 'America/New_York',
};

describe('auth routes', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await setupTestApp();
  });
  afterAll(async () => {
    await t.teardown();
  });

  describe('POST /api/auth/register', () => {
    it('creates the user, a personal group, and a session', async () => {
      const res = await call(t.app, 'POST', '/api/auth/register', { payload: validBody });
      expect(res.statusCode).toBe(201);
      expect(res.body).not.toContain('passwordHash');
      const { user } = res.json<{ user: { id: string; email: string; displayName: string } }>();
      expect(user.email).toBe('alice@example.com');
      expect(user.displayName).toBe('Alice');
      expect(sessionCookieFrom(res)).toMatch(/^sid=.+/);
      expect(String(res.headers['set-cookie'])).toMatch(/HttpOnly/i);

      const memberships = await t.prisma.membership.findMany({
        where: { userId: user.id },
        include: { group: true },
      });
      expect(memberships).toHaveLength(1);
      expect(memberships[0]?.role).toBe('owner');
      expect(memberships[0]?.group.isPersonal).toBe(true);

      const stored = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(stored.passwordHash).not.toBe(validBody.password);
    });

    it('rejects a duplicate email (case-insensitive) with 409', async () => {
      const res = await call(t.app, 'POST', '/api/auth/register', {
        payload: { ...validBody, email: 'ALICE@example.com' },
      });
      expect(res.statusCode).toBe(409);
    });

    it.each([
      ['bad email', { ...validBody, email: 'nope' }],
      ['short password', { ...validBody, email: 'x1@example.com', password: 'short' }],
      ['empty display name', { ...validBody, email: 'x2@example.com', displayName: '   ' }],
      ['long display name', { ...validBody, email: 'x3@example.com', displayName: 'a'.repeat(51) }],
      ['unknown time zone', { ...validBody, email: 'x4@example.com', timeZone: 'Mars/Olympus' }],
    ])('rejects %s with 400', async (_label, payload) => {
      const res = await call(t.app, 'POST', '/api/auth/register', { payload });
      expect(res.statusCode).toBe(400);
      expect(res.json<{ error: string }>().error).toBe('validation');
    });
  });

  describe('POST /api/auth/login', () => {
    it('signs in with the right password', async () => {
      const res = await call(t.app, 'POST', '/api/auth/login', {
        payload: { email: 'alice@example.com', password: validBody.password },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ user: { email: string } }>().user.email).toBe('alice@example.com');
      expect(res.body).not.toContain('passwordHash');
      expect(sessionCookieFrom(res)).toMatch(/^sid=/);
    });

    it('returns the identical generic 401 for wrong password and unknown email', async () => {
      const wrongPassword = await call(t.app, 'POST', '/api/auth/login', {
        payload: { email: 'alice@example.com', password: 'wrong password!' },
      });
      const unknownEmail = await call(t.app, 'POST', '/api/auth/login', {
        payload: { email: 'nobody@example.com', password: 'whatever123' },
      });
      expect(wrongPassword.statusCode).toBe(401);
      expect(unknownEmail.statusCode).toBe(401);
      expect(wrongPassword.json()).toEqual({ error: 'Invalid email or password' });
      expect(unknownEmail.body).toBe(wrongPassword.body);
    });
  });

  describe('GET /api/auth/me and POST /api/auth/logout', () => {
    it('returns 401 without a cookie', async () => {
      expect((await call(t.app, 'GET', '/api/auth/me')).statusCode).toBe(401);
      expect((await call(t.app, 'POST', '/api/auth/logout')).statusCode).toBe(401);
    });

    it('returns 401 with a garbage cookie', async () => {
      const res = await call(t.app, 'GET', '/api/auth/me', { cookie: 'sid=not-a-real-token' });
      expect(res.statusCode).toBe(401);
    });

    it('returns the user, then logs out and invalidates the session', async () => {
      const { user, cookie } = await createUserAndLogin(t.app, { displayName: 'Bob' });
      const me = await call(t.app, 'GET', '/api/auth/me', { cookie });
      expect(me.statusCode).toBe(200);
      expect(me.json<{ user: { id: string } }>().user.id).toBe(user.id);

      t.emitter.clear();
      const out = await call(t.app, 'POST', '/api/auth/logout', { cookie });
      expect(out.statusCode).toBe(204);
      expect(t.emitter.calls).toContainEqual({ kind: 'disconnectUser', userId: user.id });

      expect((await call(t.app, 'GET', '/api/auth/me', { cookie })).statusCode).toBe(401);
    });
  });
});

describe('auth rate limiting', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await setupTestApp({ authRateLimit: 2 });
  });
  afterAll(async () => {
    await t.teardown();
  });

  it('limits repeated login attempts per IP', async () => {
    const attempt = () =>
      call(t.app, 'POST', '/api/auth/login', {
        payload: { email: 'nobody@example.com', password: 'whatever123' },
      });
    expect((await attempt()).statusCode).toBe(401);
    expect((await attempt()).statusCode).toBe(401);
    expect((await attempt()).statusCode).toBe(429);
  });
});
