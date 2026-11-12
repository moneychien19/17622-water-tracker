import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, LocationSchema } from './common';

/** 1–60 chars */
const PlantNameSchema = z.string().trim().min(1).max(60);
/** integer 1–365 */
const IntervalDaysSchema = z.number().int().min(1).max(365);
/** ≤ 1000 chars */
const NotesSchema = z.string().max(1000);

export const PlantSchema = z.object({
  id: IdSchema,
  groupId: IdSchema,
  name: z.string(),
  intervalDays: z.number().int(),
  location: LocationSchema,
  notes: z.string().nullable(),
  version: z.number().int(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Plant = z.infer<typeof PlantSchema>;

export const CreatePlantBodySchema = z.object({
  name: PlantNameSchema,
  intervalDays: IntervalDaysSchema,
  location: LocationSchema,
  notes: NotesSchema.nullish(),
  /** not in the future (checked against server time; small clock-skew allowance) */
  lastWateredAt: IsoDateTimeSchema.optional().refine(
    (d) => d === undefined || d.getTime() <= Date.now() + 60_000,
    { message: 'Last watered date cannot be in the future' },
  ),
});
export type CreatePlantBody = z.infer<typeof CreatePlantBodySchema>;

export const UpdatePlantBodySchema = z
  .object({
    name: PlantNameSchema,
    intervalDays: IntervalDaysSchema,
    location: LocationSchema,
    notes: NotesSchema.nullable(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, { message: 'No fields to update' });
export type UpdatePlantBody = z.infer<typeof UpdatePlantBodySchema>;

export const WateredBySchema = z.object({ id: IdSchema, displayName: z.string() });

export const WateringSchema = z.object({
  id: IdSchema,
  wateredAt: IsoDateTimeSchema,
  wateredBy: WateredBySchema,
});
export type Watering = z.infer<typeof WateringSchema>;

export const DashboardPlantSchema = PlantSchema.extend({
  groupName: z.string(),
  lastWatering: z
    .object({
      id: IdSchema,
      at: IsoDateTimeSchema,
      byUserId: IdSchema,
      byDisplayName: z.string(),
    })
    .nullable(),
  nextDueAt: IsoDateTimeSchema,
});
export type DashboardPlant = z.infer<typeof DashboardPlantSchema>;

export const DashboardResponseSchema = z.object({
  plants: z.array(DashboardPlantSchema),
  serverTime: IsoDateTimeSchema,
});
export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;

export const WateringHistoryPageSchema = z.object({
  items: z.array(WateringSchema),
  nextCursor: z.string().nullable(),
});
export type WateringHistoryPage = z.infer<typeof WateringHistoryPageSchema>;

export const PlantResponseSchema = z.object({ plant: DashboardPlantSchema });
export const WateringResponseSchema = z.object({
  watering: WateringSchema,
  plant: DashboardPlantSchema,
});
