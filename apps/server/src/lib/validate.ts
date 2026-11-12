import type { ZodType } from 'zod';
import { ValidationError } from './errors';

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success) throw new ValidationError(result.error.issues);
  return result.data;
}
