import { ApiErrorSchema, type ApiErrorBody } from '@water/shared';
import type { ZodType } from 'zod';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody | null,
  ) {
    super(body?.error ?? `Request failed (${status})`);
    this.name = 'ApiError';
  }
}

export function isApiError(err: unknown, status?: number): err is ApiError {
  return err instanceof ApiError && (status === undefined || err.status === status);
}

type Init = Omit<RequestInit, 'body' | 'headers'> & {
  body?: unknown;
  headers?: Record<string, string>;
};

async function send(path: string, init: Init = {}): Promise<Response> {
  const { body, headers, ...rest } = init;
  const hasBody = body !== undefined;
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...rest,
    headers: { ...(hasBody ? { 'content-type': 'application/json' } : {}), ...headers },
    ...(hasBody ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    let parsed: ApiErrorBody | null = null;
    try {
      const result = ApiErrorSchema.safeParse(await res.json());
      parsed = result.success ? result.data : null;
    } catch {
      parsed = null;
    }
    throw new ApiError(res.status, parsed);
  }
  return res;
}

/** JSON request whose response is validated against a shared Zod schema. */
export async function apiFetch<T>(path: string, schema: ZodType<T>, init?: Init): Promise<T> {
  const res = await send(path, init);
  return schema.parse(await res.json());
}

/** Request expecting `204 No Content`. */
export async function apiSend(path: string, init?: Init): Promise<void> {
  await send(path, init);
}

/** Human-readable message for an error from apiFetch/apiSend. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.body?.error === 'validation') return 'Please check the highlighted fields.';
    return err.body?.error ?? err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}
