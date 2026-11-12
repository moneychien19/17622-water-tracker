import { EmailSchema, UpdateGroupBodySchema, type GroupWithRole, type User } from '@water/shared';
import { useState, type SubmitEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useCurrentUser } from '../api/auth';
import { errorMessage } from '../api/client';
import { useDeleteGroup, useGroups, useRenameGroup } from '../api/plants';
import {
  useGroupInvitations,
  useInvite,
  useMembers,
  useRemoveMember,
  useRevokeInvite,
} from '../api/sharing';
import { formString } from '../lib/form';
import { formatDate } from '../lib/format';
import { NotFound } from './NotFound';

function RenameForm({ group }: { group: GroupWithRole }) {
  const rename = useRenameGroup(group.id);
  const [error, setError] = useState<string | null>(null);
  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = UpdateGroupBodySchema.safeParse({
      name: formString(new FormData(e.currentTarget), 'name'),
    });
    if (!parsed.success) {
      setError('Group name must be 1–60 characters');
      return;
    }
    setError(null);
    rename.mutate(parsed.data);
  };
  return (
    <form className="row" onSubmit={onSubmit} noValidate aria-label="Rename group">
      <label style={{ flex: 1 }}>
        Group name
        <input name="name" defaultValue={group.name} maxLength={60} />
      </label>
      <button type="submit" disabled={rename.isPending}>
        Rename
      </button>
      {(error ?? rename.error) && (
        <p className="error" role="alert" style={{ width: '100%' }}>
          {error ?? errorMessage(rename.error)}
        </p>
      )}
    </form>
  );
}

function Members({ group, me }: { group: GroupWithRole; me: User }) {
  const navigate = useNavigate();
  const members = useMembers(group.id);
  const remove = useRemoveMember(group.id);
  const isOwner = group.role === 'owner';

  return (
    <section className="stack" aria-labelledby="members-heading">
      <h2 id="members-heading">Members</h2>
      {members.isPending && <p className="muted">Loading…</p>}
      {members.isError && <p className="error">{errorMessage(members.error)}</p>}
      <ul className="list-plain stack">
        {members.data?.map((m) => (
          <li key={m.userId} className="card row">
            <strong>{m.displayName}</strong>
            <span className="muted">{m.email}</span>
            <span className="badge">{m.role === 'owner' ? 'Owner' : 'Caretaker'}</span>
            <span style={{ marginLeft: 'auto' }}>
              {m.role !== 'owner' && m.userId === me.id && (
                <button
                  type="button"
                  className="danger"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`Leave ${group.name}?`)) {
                      remove.mutate(m.userId, { onSuccess: () => void navigate('/groups') });
                    }
                  }}
                >
                  Leave group
                </button>
              )}
              {isOwner && m.role !== 'owner' && (
                <button
                  type="button"
                  className="danger"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`Remove ${m.displayName} from ${group.name}?`)) {
                      remove.mutate(m.userId);
                    }
                  }}
                >
                  Remove
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {remove.error && <p className="error">{errorMessage(remove.error)}</p>}
    </section>
  );
}

function Invitations({ group, me }: { group: GroupWithRole; me: User }) {
  const invitations = useGroupInvitations(group.id, true);
  const invite = useInvite(group.id);
  const revoke = useRevokeInvite(group.id);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    const parsed = EmailSchema.safeParse(formString(new FormData(formEl), 'email'));
    if (!parsed.success) {
      setError('Enter a valid email address');
      return;
    }
    setError(null);
    invite.mutate(parsed.data, {
      onSuccess: () => {
        formEl.reset();
      },
    });
  };

  return (
    <section className="stack" aria-labelledby="invites-heading">
      <h2 id="invites-heading">Invite people</h2>
      <p className="muted">
        Invited people see the invitation after signing in (or registering) with that email.
        Invitations expire after 7 days.
      </p>
      <form className="card row" onSubmit={onSubmit} noValidate aria-label="Invite by email">
        <label style={{ flex: 1 }}>
          Email
          <input name="email" type="email" placeholder="friend@example.com" />
        </label>
        <button className="primary" type="submit" disabled={invite.isPending}>
          Send invite
        </button>
        {(error ?? invite.error) && (
          <p className="error" role="alert" style={{ width: '100%' }}>
            {error ?? errorMessage(invite.error)}
          </p>
        )}
      </form>
      {invitations.data && invitations.data.length > 0 && (
        <>
          <h3>Pending invitations</h3>
          <ul className="list-plain stack">
            {invitations.data.map((inv) => (
              <li key={inv.id} className="card row">
                <span>{inv.email}</span>
                <span className="muted">expires {formatDate(inv.expiresAt, me.timeZone)}</span>
                <button
                  type="button"
                  style={{ marginLeft: 'auto' }}
                  disabled={revoke.isPending}
                  onClick={() => {
                    revoke.mutate(inv.id);
                  }}
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {revoke.error && <p className="error">{errorMessage(revoke.error)}</p>}
    </section>
  );
}

export function GroupSettings() {
  const { groupId = '' } = useParams();
  const me = useCurrentUser();
  const navigate = useNavigate();
  const groups = useGroups();
  const deleteGroup = useDeleteGroup();

  if (groups.isPending) return <p className="muted">Loading…</p>;
  if (groups.isError) return <p className="error">{errorMessage(groups.error)}</p>;
  const group = groups.data.find((g) => g.id === groupId);
  if (!group) return <NotFound />;
  const isOwner = group.role === 'owner';

  return (
    <div className="stack">
      <h1>{group.name}</h1>
      {isOwner && !group.isPersonal && <RenameForm group={group} />}
      {group.isPersonal ? (
        <p className="notice">
          Personal group cannot be shared. Create a new group on the Groups page to share plants.
        </p>
      ) : (
        <>
          <Members group={group} me={me} />
          {isOwner && <Invitations group={group} me={me} />}
        </>
      )}
      {isOwner && !group.isPersonal && (
        <section className="stack" aria-labelledby="danger-heading">
          <h2 id="danger-heading">Delete group</h2>
          <p className="muted">Deletes all plants and watering history in this group.</p>
          <div>
            <button
              type="button"
              className="danger"
              disabled={deleteGroup.isPending}
              onClick={() => {
                if (window.confirm(`Delete ${group.name} and all its plants?`)) {
                  deleteGroup.mutate(group.id, { onSuccess: () => void navigate('/groups') });
                }
              }}
            >
              Delete group
            </button>
          </div>
          {deleteGroup.error && <p className="error">{errorMessage(deleteGroup.error)}</p>}
        </section>
      )}
    </div>
  );
}
