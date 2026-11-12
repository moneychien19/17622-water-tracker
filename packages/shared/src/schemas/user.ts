import { z } from 'zod';
import { EmailSchema, IdSchema } from './common';

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** valid IANA zone (e.g. `America/New_York`) */
export const TimeZoneSchema = z
  .string()
  .min(1)
  .refine(isValidTimeZone, { message: 'Unknown time zone' });

/** Public user shape. Never includes passwordHash. */
export const UserSchema = z.object({
  id: IdSchema,
  email: z.string(),
  displayName: z.string(),
  timeZone: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const RegisterBodySchema = z.object({
  email: EmailSchema,
  password: z.string().min(8, { message: 'Password must be at least 8 characters' }).max(200),
  /** 1–50 chars, trimmed */
  displayName: z.string().trim().min(1).max(50),
  timeZone: TimeZoneSchema,
});
export type RegisterBody = z.infer<typeof RegisterBodySchema>;

export const LoginBodySchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(200),
});
export type LoginBody = z.infer<typeof LoginBodySchema>;

export const UserResponseSchema = z.object({ user: UserSchema });
