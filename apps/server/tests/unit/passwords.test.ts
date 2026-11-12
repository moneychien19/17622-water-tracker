import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/auth/passwords';

describe('password hashing', () => {
  it('produces an argon2id hash that is not the plaintext', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).not.toContain('correct horse battery');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword(hash, 'correct horse battery')).toBe(true);
    expect(await verifyPassword(hash, 'wrong horse battery')).toBe(false);
  });

  it('returns false (does not throw) for a malformed hash', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
  });
});
