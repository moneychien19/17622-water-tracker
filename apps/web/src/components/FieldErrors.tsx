import { ApiError } from '../api/client';

interface Issue {
  path: PropertyKey[];
  message: string;
}

function isIssue(value: unknown): value is Issue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'path' in value &&
    Array.isArray(value.path) &&
    'message' in value &&
    typeof value.message === 'string'
  );
}

/** Map server/Zod validation issues to `{ fieldName: message }`. */
export function fieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (err instanceof ApiError && err.body?.error === 'validation') {
    for (const issue of err.body.issues ?? []) {
      if (!isIssue(issue)) continue;
      const key = String(issue.path[0] ?? '');
      out[key] ??= issue.message;
    }
  }
  return out;
}

export function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <span className="error" role="alert">
      {message}
    </span>
  );
}
