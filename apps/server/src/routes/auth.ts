import { LoginBodySchema, RegisterBodySchema } from '@water/shared';
import { currentUser } from '../auth/hook';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  setSessionCookie,
} from '../auth/sessions';
import { parseBody } from '../lib/validate';
import { login, register } from '../services/auth.service';
import { ctxOf } from '../services/context';
import type { RouteModule } from './index';

export const authRoutes: RouteModule = (app, opts) => {
  const ctx = ctxOf(app);
  const limited = { rateLimit: { max: opts.authRateLimit, timeWindow: '1 minute' } };

  app.post('/api/auth/register', { config: { public: true, ...limited } }, async (req, reply) => {
    const body = parseBody(RegisterBodySchema, req.body);
    const user = await register(ctx, body);
    const token = await createSession(app.prisma, user.id, app.now());
    setSessionCookie(reply, token, app.cookieSecure);
    return reply.status(201).send({ user });
  });

  app.post('/api/auth/login', { config: { public: true, ...limited } }, async (req, reply) => {
    const body = parseBody(LoginBodySchema, req.body);
    const user = await login(ctx, body);
    const token = await createSession(app.prisma, user.id, app.now());
    setSessionCookie(reply, token, app.cookieSecure);
    return reply.send({ user });
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const user = currentUser(req);
    if (req.sessionToken) await destroySession(app.prisma, req.sessionToken);
    app.emitter.disconnectUser(user.id);
    clearSessionCookie(reply, app.cookieSecure);
    return reply.status(204).send();
  });

  app.get('/api/auth/me', (req) => ({ user: currentUser(req) }));
};
