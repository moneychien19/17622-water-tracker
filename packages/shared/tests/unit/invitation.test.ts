import { describe, expect, it } from 'vitest';
import { effectiveStatus, INVITE_TTL_MS, inviteExpiry } from '../../src/domain/invitation';

describe('invitations', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  it('expire 7 days after creation', () => {
    expect(INVITE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(inviteExpiry(now)).toEqual(new Date('2026-06-22T12:00:00Z'));
  });

  it('pending before expiresAt stays pending', () => {
    expect(
      effectiveStatus({ status: 'pending', expiresAt: new Date(now.getTime() + 1) }, now),
    ).toBe('pending');
  });

  it('pending at or past expiresAt becomes expired', () => {
    expect(effectiveStatus({ status: 'pending', expiresAt: now }, now)).toBe('expired');
    expect(
      effectiveStatus({ status: 'pending', expiresAt: new Date(now.getTime() - 1) }, now),
    ).toBe('expired');
  });

  it.each(['accepted', 'declined', 'revoked', 'expired'] as const)(
    '%s is returned unchanged',
    (status) => {
      expect(effectiveStatus({ status, expiresAt: new Date(0) }, now)).toBe(status);
    },
  );
});
