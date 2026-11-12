import { z } from 'zod';
import { parseBody } from './validate';

const IdParam = z.string().min(1).max(64);

/** Parse a single named route param (Fastify types params as unknown). */
export function param(params: unknown, name: string): string {
  return parseBody(z.object({ [name]: IdParam }), params)[name] ?? '';
}

export function optionalQuery(query: unknown, name: string): string | undefined {
  return parseBody(z.object({ [name]: z.string().min(1).max(64).optional() }), query)[name];
}
