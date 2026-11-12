import type { Server as HttpServer } from 'node:http';
import type { EventName, EventPayloads, ServerToClientEvents } from '@water/shared';
import type { RealtimeEmitter } from './emitter';
import {
  attachSocketServer,
  groupRoom,
  userRoom,
  type IoServer,
  type SocketServerOptions,
} from './socket';

/** Socket.IO implementation of RealtimeEmitter (rooms: `user:<id>`, `group:<id>`). */
export class SocketEmitter implements RealtimeEmitter {
  constructor(readonly io: IoServer) {}

  toGroup<E extends EventName>(groupId: string, event: E, payload: EventPayloads[E]): void {
    this.emit(groupRoom(groupId), event, payload);
  }

  toUser<E extends EventName>(userId: string, event: E, payload: EventPayloads[E]): void {
    this.emit(userRoom(userId), event, payload);
  }

  joinGroup(userId: string, groupId: string): void {
    this.io.in(userRoom(userId)).socketsJoin(groupRoom(groupId));
  }

  leaveGroup(userId: string, groupId: string): void {
    this.io.in(userRoom(userId)).socketsLeave(groupRoom(groupId));
  }

  evictGroup(groupId: string): void {
    this.io.in(groupRoom(groupId)).socketsLeave(groupRoom(groupId));
  }

  disconnectUser(userId: string): void {
    this.io.in(userRoom(userId)).disconnectSockets(true);
  }

  async close(): Promise<void> {
    await this.io.close();
  }

  private emit<E extends EventName>(room: string, event: E, payload: EventPayloads[E]): void {
    // Justified cast: Socket.IO's emit() cannot resolve its parameter tuple for a generic E.
    // The public methods constrain `payload` to EventPayloads[E], so the pair is consistent.
    const args = [payload] as Parameters<ServerToClientEvents[E]>;
    this.io.to(room).emit(event, ...args);
  }
}

export function createSocketEmitter(
  httpServer: HttpServer,
  opts: SocketServerOptions,
): SocketEmitter {
  return new SocketEmitter(attachSocketServer(httpServer, opts));
}
