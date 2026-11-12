import { useNavigate } from 'react-router';
import { useCurrentUser } from '../api/auth';
import { errorMessage } from '../api/client';
import { useAcceptInvite, useDeclineInvite, useMyInvitations } from '../api/sharing';
import { formatDate } from '../lib/format';

export function Invitations() {
  const me = useCurrentUser();
  const navigate = useNavigate();
  const invitations = useMyInvitations();
  const accept = useAcceptInvite();
  const decline = useDeclineInvite();

  return (
    <div className="stack">
      <h1>Invitations</h1>
      {invitations.isPending && <p className="muted">Loading…</p>}
      {invitations.isError && <p className="error">{errorMessage(invitations.error)}</p>}
      {invitations.data?.length === 0 && <p className="muted">No pending invitations.</p>}
      <ul className="list-plain stack">
        {invitations.data?.map((inv) => (
          <li key={inv.id} className="card row">
            <div style={{ marginRight: 'auto' }}>
              <strong>{inv.groupName}</strong>
              <div className="muted">
                Invited by {inv.invitedByName} · expires {formatDate(inv.expiresAt, me.timeZone)}
              </div>
            </div>
            <button
              type="button"
              disabled={decline.isPending || accept.isPending}
              onClick={() => {
                decline.mutate(inv.id);
              }}
            >
              Decline
            </button>
            <button
              type="button"
              className="primary"
              disabled={accept.isPending || decline.isPending}
              onClick={() => {
                accept.mutate(inv.id, { onSuccess: () => void navigate('/') });
              }}
            >
              Accept
            </button>
          </li>
        ))}
      </ul>
      {(accept.error ?? decline.error) && (
        <p className="error" role="alert">
          {errorMessage(accept.error ?? decline.error)}
        </p>
      )}
    </div>
  );
}
