import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type { Server as HttpServer } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { registerAuthHook } from './auth/hook';
import { HttpError, ValidationError } from './lib/errors';
import type { RealtimeEmitter } from './realtime/emitter';
import { allRoutes, type RouteOptions } from './routes/index';

export interface AppDeps {
  prisma: PrismaClient;
  /**
   * A ready emitter, or a factory that receives Fastify's HTTP server (needed by Socket.IO,
   * which must attach to the server before it starts listening).
   */
  emitter: RealtimeEmitter | ((httpServer: HttpServer) => RealtimeEmitter);
  /** Injectable clock for tests. */
  now?: () => Date;
  cookieSecure?: boolean;
  logger?: boolean;
  /** Max register/login attempts per IP per minute (default 10). */
  authRateLimit?: number;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? false });

  const emitter = typeof deps.emitter === 'function' ? deps.emitter(app.server) : deps.emitter;
  app.decorate('prisma', deps.prisma);
  app.decorate('emitter', emitter);
  app.addHook('onClose', async () => {
    await emitter.close?.();
  });
  app.decorate('now', deps.now ?? (() => new Date()));
  app.decorate('cookieSecure', deps.cookieSecure ?? false);

  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ValidationError) {
      return reply.status(400).send({ error: 'validation', issues: err.issues });
    }
    if (err instanceof HttpError) {
      return reply.status(err.status).send({ error: err.message });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'validation', issues: err.issues });
    }
    const status =
      typeof err === 'object' && err !== null && 'statusCode' in err ? Number(err.statusCode) : 500;
    if (status >= 400 && status < 500) {
      const message = err instanceof Error ? err.message : 'Bad request';
      return reply.status(status).send({ error: message });
    }
    request.log.error(err);
    return reply.status(500).send({ error: 'Internal Server Error' });
  });

  registerAuthHook(app);

  app.get('/api/health', { config: { public: true } }, () => ({ ok: true }));

  const opts: RouteOptions = { authRateLimit: deps.authRateLimit ?? 10 };
  for (const register of allRoutes) register(app, opts);

  return app;
}
