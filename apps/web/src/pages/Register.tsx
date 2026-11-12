import { RegisterBodySchema } from '@water/shared';
import { useState, type SubmitEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useRegister } from '../api/auth';
import { errorMessage } from '../api/client';
import { FieldError, fieldErrors } from '../components/FieldErrors';
import { formString } from '../lib/form';

export function Register() {
  const navigate = useNavigate();
  const registerMutation = useRegister();
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = RegisterBodySchema.safeParse({
      email: formString(form, 'email'),
      displayName: formString(form, 'displayName'),
      password: formString(form, 'password'),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] ??= issue.message;
      setClientErrors(errs);
      return;
    }
    setClientErrors({});
    registerMutation.mutate(parsed.data, { onSuccess: () => void navigate('/') });
  };

  const errors = { ...fieldErrors(registerMutation.error), ...clientErrors };
  const generalError =
    registerMutation.error && Object.keys(fieldErrors(registerMutation.error)).length === 0
      ? errorMessage(registerMutation.error)
      : null;

  return (
    <div className="auth-box card">
      <h1>Create account</h1>
      <form className="stack" onSubmit={onSubmit} noValidate>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
          <FieldError message={errors.email} />
        </label>
        <label>
          Display name
          <input name="displayName" autoComplete="nickname" maxLength={50} required />
          <FieldError message={errors.displayName} />
        </label>
        <label>
          Password (at least 8 characters)
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <FieldError message={errors.password} />
        </label>
        <FieldError message={errors.timeZone} />
        {generalError && (
          <p className="error" role="alert">
            {generalError}
          </p>
        )}
        <button className="primary" type="submit" disabled={registerMutation.isPending}>
          {registerMutation.isPending ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p className="muted">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}
