import type { EventName, EventPayloads } from '@water/shared';

/**
 * Services publish real-time events only through this interface. US1/US2 run with
 * NoopEmitter/RecordingEmitter; US3 plugs in the Socket.IO implementation.
 * Callers MUST invoke these only after their DB transaction has committed.
 */
export interface RealtimeEmitter {
  toGroup<E extends EventName>(groupId: string, event: E, payload: EventPayloads[E]): void;
  toUser<E extends EventName>(userId: string, event: E, payload: EventPayloads[E]): void;
  joinGroup(userId: string, groupId: string): void;
  leaveGroup(userId: string, groupId: string): void;
  evictGroup(groupId: string): void;
  disconnectUser(userId: string): void;
  /** Release resources (e.g. close the Socket.IO server) when the app shuts down. */
  close?(): Promise<void>;
}

export class NoopEmitter implements RealtimeEmitter {
  toGroup(): void {}
  toUser(): void {}
  joinGroup(): void {}
  leaveGroup(): void {}
  evictGroup(): void {}
  disconnectUser(): void {}
}

export interface RecordedEvent {
  kind: 'toGroup' | 'toUser';
  target: string;
  event: EventName;
  payload: unknown;
}

export type RecordedCall =
  | RecordedEvent
  | { kind: 'joinGroup' | 'leaveGroup'; userId: string; groupId: string }
  | { kind: 'evictGroup'; groupId: string }
  | { kind: 'disconnectUser'; userId: string };

/** Test double that records every call in order. */
export class RecordingEmitter implements RealtimeEmitter {
  readonly calls: RecordedCall[] = [];

  toGroup<E extends EventName>(groupId: string, event: E, payload: EventPayloads[E]): void {
    this.calls.push({ kind: 'toGroup', target: groupId, event, payload });
  }
  toUser<E extends EventName>(userId: string, event: E, payload: EventPayloads[E]): void {
    this.calls.push({ kind: 'toUser', target: userId, event, payload });
  }
  joinGroup(userId: string, groupId: string): void {
    this.calls.push({ kind: 'joinGroup', userId, groupId });
  }
  leaveGroup(userId: string, groupId: string): void {
    this.calls.push({ kind: 'leaveGroup', userId, groupId });
  }
  evictGroup(groupId: string): void {
    this.calls.push({ kind: 'evictGroup', groupId });
  }
  disconnectUser(userId: string): void {
    this.calls.push({ kind: 'disconnectUser', userId });
  }

  events(event?: EventName): RecordedEvent[] {
    return this.calls.filter(
      (c): c is RecordedEvent =>
        (c.kind === 'toGroup' || c.kind === 'toUser') && (!event || c.event === event),
    );
  }

  clear(): void {
    this.calls.length = 0;
  }
}
