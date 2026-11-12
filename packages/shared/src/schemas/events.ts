import { z } from 'zod';
import { IdSchema, RoleSchema } from './common';
import { GroupSchema, InvitationSchema } from './group';
import { DashboardPlantSchema, WateringSchema } from './plant';

/**
 * Server → client real-time events (contracts/realtime-events.md).
 * Plant-scoped events carry the full DashboardPlant including `version`.
 */
export const eventSchemas = {
  'plant:created': z.object({ plant: DashboardPlantSchema }),
  'plant:updated': z.object({ plant: DashboardPlantSchema }),
  'plant:deleted': z.object({ plantId: IdSchema, groupId: IdSchema }),
  'plant:watered': z.object({ plant: DashboardPlantSchema, watering: WateringSchema }),
  'plant:watering-undone': z.object({ plant: DashboardPlantSchema, wateringId: IdSchema }),
  'group:updated': z.object({ group: GroupSchema }),
  'group:deleted': z.object({ groupId: IdSchema }),
  'group:member-joined': z.object({
    groupId: IdSchema,
    member: z.object({ userId: IdSchema, displayName: z.string(), role: RoleSchema }),
  }),
  'group:member-left': z.object({ groupId: IdSchema, userId: IdSchema }),
  'group:access-revoked': z.object({ groupId: IdSchema }),
  'invitation:received': z.object({ invitation: InvitationSchema }),
} as const;

export type EventName = keyof typeof eventSchemas;
// Justified cast: Object.keys() is typed string[]; eventSchemas is a closed const object.
export const eventNames = Object.keys(eventSchemas) as EventName[];

export type EventPayloads = { [K in EventName]: z.infer<(typeof eventSchemas)[K]> };

export type ServerToClientEvents = { [K in EventName]: (payload: EventPayloads[K]) => void };

export type RealtimeEvent = { [K in EventName]: { type: K; payload: EventPayloads[K] } }[EventName];
