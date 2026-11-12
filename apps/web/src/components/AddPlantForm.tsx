import { CreatePlantBodySchema } from '@water/shared';
import { useState, type SubmitEvent } from 'react';
import { errorMessage } from '../api/client';
import { useCreatePlant, useGroups } from '../api/plants';
import { todayInputValue } from '../lib/format';
import { formString } from '../lib/form';
import { FieldError, fieldErrors } from './FieldErrors';

/** "Last watered" date input → an instant: noon local on that day, never in the future. */
function lastWateredInstant(value: string): string | undefined {
  if (!value) return undefined;
  const noon = new Date(`${value}T12:00:00`);
  const now = new Date();
  return (noon.getTime() > now.getTime() ? now : noon).toISOString();
}

export function AddPlantForm({ onDone }: { onDone?: () => void }) {
  const groups = useGroups();
  const create = useCreatePlant();
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const ownedGroups = (groups.data ?? []).filter((g) => g.role === 'owner');

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const groupId = formString(form, 'groupId');
    const notes = formString(form, 'notes').trim();
    const parsed = CreatePlantBodySchema.safeParse({
      name: formString(form, 'name'),
      intervalDays: Number(formString(form, 'intervalDays')),
      location: formString(form, 'location'),
      notes: notes === '' ? null : notes,
      lastWateredAt: lastWateredInstant(formString(form, 'lastWatered')),
    });
    if (!parsed.success || !groupId) {
      const errs: Record<string, string> = {};
      if (!groupId) errs.groupId = 'Choose a group';
      for (const issue of parsed.error?.issues ?? []) errs[String(issue.path[0])] ??= issue.message;
      setClientErrors(errs);
      return;
    }
    setClientErrors({});
    create.mutate(
      { groupId, body: parsed.data },
      {
        onSuccess: () => {
          formEl.reset();
          onDone?.();
        },
      },
    );
  };

  if (groups.isSuccess && ownedGroups.length === 0) {
    return <p className="muted">You don't own any groups, so you can't add plants.</p>;
  }

  const errors = { ...fieldErrors(create.error), ...clientErrors };

  return (
    <form className="card stack" onSubmit={onSubmit} noValidate aria-label="Add a plant">
      <h2>Add a plant</h2>
      <div className="form-grid">
        <label>
          Group
          <select name="groupId" defaultValue={ownedGroups[0]?.id}>
            {ownedGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <FieldError message={errors.groupId} />
        </label>
        <label>
          Name
          <input name="name" maxLength={60} required />
          <FieldError message={errors.name} />
        </label>
        <label>
          Water every (days)
          <input name="intervalDays" type="number" min={1} max={365} defaultValue={3} required />
          <FieldError message={errors.intervalDays} />
        </label>
        <label>
          Location
          <select name="location" defaultValue="inside">
            <option value="inside">Inside</option>
            <option value="outside">Outside</option>
          </select>
        </label>
        <label>
          Last watered (optional)
          <input name="lastWatered" type="date" max={todayInputValue()} />
          <FieldError message={errors.lastWateredAt} />
        </label>
      </div>
      <label>
        Notes (optional)
        <textarea name="notes" maxLength={1000} rows={2} />
        <FieldError message={errors.notes} />
      </label>
      {create.error && Object.keys(fieldErrors(create.error)).length === 0 && (
        <p className="error" role="alert">
          {errorMessage(create.error)}
        </p>
      )}
      <div className="row">
        <button className="primary" type="submit" disabled={create.isPending}>
          {create.isPending ? 'Adding…' : 'Add plant'}
        </button>
        {onDone && (
          <button type="button" onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
