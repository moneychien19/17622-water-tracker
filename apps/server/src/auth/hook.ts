import type { FastifyInstance, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../lib/errors';
import { SESSION_COOKIE, validateSession, type SessionUser } from './sessions';

/**
 * Global onRequest hook: every /api route requires a valid session unless its route config
 * sets `public: true` (Constitution IV).
 */
export function registerAuthHook(app: FastifyInstance): void {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionToken', null);

  app.addHook('onRequest', async (request) => {
    if (!request.url.startsWith('/api/')) return;
    if (request.routeOptions.config.public === true) return;

    const token = request.cookies[SESSION_COOKIE];
    const user = await validateSession(app.prisma, token, app.now());
    if (!user || !token) throw new UnauthorizedError();
    request.user = user;
    request.sessionToken = token;
  });
}

/** Narrow request.user inside handlers on authenticated routes. */
export function currentUser(request: FastifyRequest): SessionUser {
  if (!request.user) throw new UnauthorizedError();
  return request.user;
}
