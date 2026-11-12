import type { SubmitEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useLogin } from '../api/auth';
import { errorMessage } from '../api/client';
import { formString } from '../lib/form';

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const loginMutation = useLogin();
  const state: unknown = location.state;
  const from =
    typeof state === 'object' && state !== null && 'from' in state && typeof state.from === 'string'
      ? state.from
      : '/';

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    loginMutation.mutate(
      { email: formString(form, 'email'), password: formString(form, 'password') },
      { onSuccess: () => void navigate(from, { replace: true }) },
    );
  };

  return (
    <div className="auth-box card">
      <h1>Sign in</h1>
      <form className="stack" onSubmit={onSubmit}>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {loginMutation.error && (
          <p className="error" role="alert">
            {errorMessage(loginMutation.error)}
          </p>
        )}
        <button className="primary" type="submit" disabled={loginMutation.isPending}>
          {loginMutation.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="muted">
        New here? <Link to="/register">Create an account</Link>
      </p>
    </div>
  );
}
