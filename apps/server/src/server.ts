import { buildApp } from './app';
import { loadConfig } from './config';
import { createPrisma } from './db';
import { createSocketEmitter } from './realtime/socket-emitter';

const config = loadConfig();
const prisma = createPrisma(config.DATABASE_URL);

const now = () => new Date();
const app = await buildApp({
  prisma,
  now,
  emitter: (httpServer) =>
    createSocketEmitter(httpServer, { prisma, now, webOrigin: config.WEB_ORIGIN }),
  cookieSecure: config.COOKIE_SECURE,
  logger: config.NODE_ENV !== 'test',
});

const shutdown = async (): Promise<void> => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

await app.listen({ port: config.PORT, host: '0.0.0.0' });
