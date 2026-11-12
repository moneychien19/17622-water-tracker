import { Link, Outlet, useNavigate } from 'react-router';
import { useCurrentUser, useLogout } from '../api/auth';
import { useMyInvitations } from '../api/sharing';
import { useRealtime } from '../realtime/useRealtime';

export function Layout() {
  const user = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();
  const pendingInvites = useMyInvitations().data?.length ?? 0;
  const realtime = useRealtime();

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          💧 Water Tracker
        </Link>
        <nav aria-label="Main">
          <Link to="/">Dashboard</Link>
          <Link to="/groups">Groups</Link>
          <Link to="/invitations">
            Invitations
            {pendingInvites > 0 && (
              <>
                {' '}
                <span className="badge count" aria-label={`${pendingInvites} pending`}>
                  {pendingInvites}
                </span>
              </>
            )}
          </Link>
          <span className="muted">{user.displayName}</span>
          <button
            type="button"
            onClick={() => {
              logout.mutate(undefined, { onSettled: () => void navigate('/login') });
            }}
          >
            Sign out
          </button>
        </nav>
      </header>
      <main className="content">
        {realtime.notice && (
          <div className="notice row" role="status">
            <span style={{ marginRight: 'auto' }}>{realtime.notice}</span>
            <button type="button" onClick={realtime.dismiss}>
              Dismiss
            </button>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
