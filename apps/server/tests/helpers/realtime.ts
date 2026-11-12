import { eventSchemas, type EventName, type EventPayloads } from '@water/shared';
import type { FastifyInstance } from 'fastify';
import { io as ioClient, type Socket } from 'socket.io-client';
import { buildApp } from '../../src/app';
import { createSocketEmitter, type SocketEmitter } from '../../src/realtime/socket-emitter';
import { createClock, createTestDb, type TestClock } from './app';

export interface RealtimeTestApp {
  app: FastifyInstance;
  baseUrl: string;
  emitter: SocketEmitter;
  clock: TestClock;
  prisma: ReturnType<typeof createTestDb>['prisma'];
  connectAs: (cookie?: string) => Socket;
  teardown: () => Promise<void>;
}

/** Real HTTP + Socket.IO server on an ephemeral port. */
export async function setupRealtimeTestApp(): Promise<RealtimeTestApp> {
  const db = createTestDb();
  const clock = createClock();
  let emitter: SocketEmitter | undefined;
  const app = await buildApp({
    prisma: db.prisma,
    now: clock.now,
    authRateLimit: 10_000,
    emitter: (httpServer) => {
      emitter = createSocketEmitter(httpServer, {
        prisma: db.prisma,
        now: clock.now,
        webOrigin: 'http://localhost',
      });
      return emitter;
    },
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('no server address');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  if (!emitter) throw new Error('socket emitter was not created');

  const sockets: Socket[] = [];
  const connectAs = (cookie?: string): Socket => {
    const s = ioClient(baseUrl, {
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      ...(cookie ? { extraHeaders: { cookie } } : {}),
    });
    sockets.push(s);
    return s;
  };

  return {
    app,
    baseUrl,
    emitter,
    clock,
    prisma: db.prisma,
    connectAs,
    teardown: async () => {
      for (const s of sockets) s.disconnect();
      await app.close();
      await db.cleanup();
    },
  };
}

export function waitForConnect(socket: Socket, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      reject(new Error('connect timeout'));
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export function waitForConnectError(socket: Socket, timeoutMs = 5000): Promise<Error> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('expected connect_error'));
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      reject(new Error('unexpectedly connected'));
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      resolve(err);
    });
  });
}

/** Resolve with the next `event` payload (validated by its shared schema), or reject. */
export function waitForEvent<E extends EventName>(
  socket: Socket,
  event: E,
  timeoutMs = 5000,
): Promise<EventPayloads[E]> {
  const schema = eventSchemas[event];
  const name: string = event; // untyped client socket: listen by plain event name
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    function handler(payload: unknown): void {
      clearTimeout(timer);
      const parsed = schema.safeParse(payload);
      // Justified cast: eventSchemas[E] infers exactly EventPayloads[E] (see events.ts).
      if (parsed.success) resolve(parsed.data as EventPayloads[E]);
      else reject(parsed.error);
    }
    socket.once(name, handler);
  });
}

/** Record every payload received for an event. */
export function collect(socket: Socket, event: EventName): unknown[] {
  const received: unknown[] = [];
  socket.on(event, (payload: unknown) => received.push(payload));
  return received;
}

export const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
