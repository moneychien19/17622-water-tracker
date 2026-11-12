import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { RealtimeEmitter } from '../realtime/emitter';

/** Dependencies every service function receives. */
export interface ServiceContext {
  prisma: PrismaClient;
  emitter: RealtimeEmitter;
  now: () => Date;
}

export function ctxOf(app: FastifyInstance): ServiceContext {
  return { prisma: app.prisma, emitter: app.emitter, now: app.now };
}
