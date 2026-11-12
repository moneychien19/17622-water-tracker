import type { Server as HttpServer } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import type { ServerToClientEvents } from '@water/shared';
import { Server } from 'socket.io';
import { readSidFromCookieHeader, validateSession } from '../auth/sessions';

/** Clients send nothing in v1: all writes go through REST (contracts/realtime-events.md). */
type ClientToServerEvents = Record<string, never>;
type InterServerEvents = Record<string, never>;

interface SocketData {
  userId: string;
  groupIds: string[];
}

export type IoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export const userRoom = (userId: string) => `user:${userId}`;
export const groupRoom = (groupId: string) => `group:${groupId}`;

export interface SocketServerOptions {
  prisma: PrismaClient;
  now: () => Date;
  webOrigin: string;
}

export function attachSocketServer(httpServer: HttpServer, opts: SocketServerOptions): IoServer {
  const io: IoServer = new Server(httpServer, {
    cors: { origin: opts.webOrigin, credentials: true },
  });

  // Handshake: the session cookie authenticates the socket; memberships are loaded up front so
  // room joins in the connection handler are synchronous (before the client sees `connect`).
  io.use((socket, next) => {
    const token = readSidFromCookieHeader(socket.handshake.headers.cookie);
    validateSession(opts.prisma, token, opts.now())
      .then(async (user) => {
        if (!user) {
          next(new Error('unauthorized'));
          return;
        }
        const memberships = await opts.prisma.membership.findMany({
          where: { userId: user.id },
          select: { groupId: true },
        });
        socket.data.userId = user.id;
        socket.data.groupIds = memberships.map((m) => m.groupId);
        next();
      })
      .catch(() => {
        next(new Error('unauthorized'));
      });
  });

  io.on('connection', (socket) => {
    void socket.join([
      userRoom(socket.data.userId),
      ...socket.data.groupIds.map((id) => groupRoom(id)),
    ]);
  });

  return io;
}
