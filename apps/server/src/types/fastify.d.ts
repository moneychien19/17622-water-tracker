import type { PrismaClient } from '@prisma/client';
import type { SessionUser } from '../auth/sessions';
import type { RealtimeEmitter } from '../realtime/emitter';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    emitter: RealtimeEmitter;
    now: () => Date;
    cookieSecure: boolean;
  }

  interface FastifyRequest {
    user: SessionUser | null;
    sessionToken: string | null;
  }

  interface FastifyContextConfig {
    /** Route is reachable without a session (register, login, health). */
    public?: boolean;
  }
}
