import { Navigate, Outlet, useLocation } from 'react-router';
import { useMe } from '../api/auth';
import { errorMessage } from '../api/client';

/** Redirects signed-out visitors to /login (FR-002). */
export function RequireAuth() {
  const location = useLocation();
  const me = useMe();

  if (me.isPending) return <p className="content muted">Loading…</p>;
  if (me.isError) return <p className="content error">{errorMessage(me.error)}</p>;
  if (!me.data) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** Sends already signed-in users away from /login and /register. */
export function RedirectIfAuthed() {
  const me = useMe();
  if (me.isPending) return null;
  if (me.data) return <Navigate to="/" replace />;
  return <Outlet />;
}
