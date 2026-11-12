import { CreateGroupBodySchema } from '@water/shared';
import { useState, type SubmitEvent } from 'react';
import { errorMessage } from '../api/client';
import { useCreateGroup } from '../api/plants';
import { formString } from '../lib/form';

export function CreateGroupForm() {
  const create = useCreateGroup();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    const parsed = CreateGroupBodySchema.safeParse({
      name: formString(new FormData(formEl), 'name'),
    });
    if (!parsed.success) {
      setError('Group name must be 1–60 characters');
      return;
    }
    setError(null);
    create.mutate(parsed.data, {
      onSuccess: () => {
        formEl.reset();
      },
    });
  };

  return (
    <form className="card row" onSubmit={onSubmit} noValidate aria-label="Create a group">
      <label style={{ flex: 1 }}>
        New group name
        <input name="name" maxLength={60} placeholder="e.g. Balcony" />
      </label>
      <button className="primary" type="submit" disabled={create.isPending}>
        Create group
      </button>
      {(error ?? create.error) && (
        <p className="error" role="alert" style={{ width: '100%' }}>
          {error ?? errorMessage(create.error)}
        </p>
      )}
    </form>
  );
}
