import { hash, verify } from '@node-rs/argon2';

/** @node-rs/argon2 defaults to argon2id (asserted in tests/unit/passwords.test.ts). */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    return false;
  }
}
