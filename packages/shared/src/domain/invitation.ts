import type { InvitationStatus } from '../schemas/group';

/** Invitations expire 7 days after they are sent. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function inviteExpiry(createdAt: Date): Date {
  return new Date(createdAt.getTime() + INVITE_TTL_MS);
}

/** Expiry is evaluated on read: a pending invitation at/after expiresAt is `expired`. */
export function effectiveStatus(
  invitation: { status: InvitationStatus; expiresAt: Date },
  now: Date,
): InvitationStatus {
  if (invitation.status === 'pending' && now.getTime() >= invitation.expiresAt.getTime()) {
    return 'expired';
  }
  return invitation.status;
}
