import { Link } from 'react-router';
import { errorMessage } from '../api/client';
import { useGroups } from '../api/plants';
import { CreateGroupForm } from '../components/CreateGroupForm';

export function Groups() {
  const groups = useGroups();

  return (
    <div className="stack">
      <h1>Groups</h1>
      <p className="muted">
        Groups are how you share plants. Your personal group is private; create another group to
        share it with others.
      </p>
      <CreateGroupForm />
      {groups.isPending && <p className="muted">Loading…</p>}
      {groups.isError && <p className="error">{errorMessage(groups.error)}</p>}
      {groups.data && (
        <ul className="list-plain stack">
          {groups.data.map((g) => (
            <li key={g.id} className="card row">
              <strong>{g.name}</strong>
              <span className="muted">
                {g.isPersonal ? 'Personal' : g.role === 'owner' ? 'Owner' : 'Caretaker'}
              </span>
              <Link to={`/groups/${g.id}/settings`} style={{ marginLeft: 'auto' }}>
                {g.isPersonal ? 'Details' : 'Members & settings'}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
