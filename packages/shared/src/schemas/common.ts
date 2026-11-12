import { z } from 'zod';

export const IdSchema = z.string().min(1);

/**
 * Accepts an ISO string (wire format) or a Date (in-process) and yields a Date.
 * Responses are JSON-serialized, so clients always see strings and coerce them back.
 */
export const IsoDateTimeSchema = z.coerce.date();

export const ApiErrorSchema = z.object({
  error: z.string(),
  issues: z.array(z.unknown()).optional(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorSchema>;

export const RoleSchema = z.enum(['owner', 'caretaker']);
export type Role = z.infer<typeof RoleSchema>;

export const LocationSchema = z.enum(['inside', 'outside']);
export type Location = z.infer<typeof LocationSchema>;

/** lowercase-normalized, valid email, ≤ 254 chars */
export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: 'Enter a valid email address' }));
