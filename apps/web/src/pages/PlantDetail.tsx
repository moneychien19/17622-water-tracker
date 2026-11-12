import { canUndo, UpdatePlantBodySchema, type DashboardPlant, type User } from '@water/shared';
import { useState, type SubmitEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useCurrentUser } from '../api/auth';
import { errorMessage, isApiError } from '../api/client';
import {
  useCan,
  useDeletePlant,
  usePlant,
  useUndoWatering,
  useUpdatePlant,
  useWateringHistory,
  useWaterPlant,
} from '../api/plants';
import { FieldError, fieldErrors } from '../components/FieldErrors';
import { formString } from '../lib/form';
import { formatDateTime, formatDue } from '../lib/format';
import { useNow } from '../lib/useNow';
import { NotFound } from './NotFound';

function EditPlantForm({ plant, onDone }: { plant: DashboardPlant; onDone: () => void }) {
  const update = useUpdatePlant(plant.id);
  const canEditCore = useCan(plant.groupId, 'plant:update:core');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const notes = formString(form, 'notes').trim();
    const parsed = UpdatePlantBodySchema.safeParse({
      ...(canEditCore
        ? {
            name: formString(form, 'name'),
            intervalDays: Number(formString(form, 'intervalDays')),
          }
        : {}),
      location: formString(form, 'location'),
      notes: notes === '' ? null : notes,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] ??= issue.message;
      setClientErrors(errs);
      return;
    }
    setClientErrors({});
    update.mutate(parsed.data, { onSuccess: onDone });
  };

  const errors = { ...fieldErrors(update.error), ...clientErrors };
  return (
    <form className="card stack" onSubmit={onSubmit} noValidate aria-label="Edit plant">
      <div className="form-grid">
        {canEditCore && (
          <>
            <label>
              Name
              <input name="name" defaultValue={plant.name} maxLength={60} />
              <FieldError message={errors.name} />
            </label>
            <label>
              Water every (days)
              <input
                name="intervalDays"
                type="number"
                min={1}
                max={365}
                defaultValue={plant.intervalDays}
              />
              <FieldError message={errors.intervalDays} />
            </label>
          </>
        )}
        <label>
          Location
          <select name="location" defaultValue={plant.location}>
            <option value="inside">Inside</option>
            <option value="outside">Outside</option>
          </select>
        </label>
      </div>
      <label>
        Notes
        <textarea name="notes" defaultValue={plant.notes ?? ''} maxLength={1000} rows={3} />
        <FieldError message={errors.notes} />
      </label>
      {update.error && Object.keys(fieldErrors(update.error)).length === 0 && (
        <p className="error" role="alert">
          {errorMessage(update.error)}
        </p>
      )}
      <div className="row">
        <button className="primary" type="submit" disabled={update.isPending}>
          Save
        </button>
        <button type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function History({ plantId, me, now }: { plantId: string; me: User; now: Date }) {
  const history = useWateringHistory(plantId);
  const undo = useUndoWatering();

  if (history.isPending) return <p className="muted">Loading history…</p>;
  if (history.isError) return <p className="error">{errorMessage(history.error)}</p>;

  const items = history.data.pages.flatMap((p) => p.items);
  const newest = items[0];
  return (
    <section className="stack" aria-labelledby="history-heading">
      <h2 id="history-heading">Watering history</h2>
      {items.length === 0 ? (
        <p className="muted">No waterings recorded yet.</p>
      ) : (
        <ul className="list-plain stack">
          {items.map((w) => (
            <li key={w.id} className="card row">
              <span>{formatDateTime(w.wateredAt, me.timeZone)}</span>
              <span className="muted">by {w.wateredBy.displayName}</span>
              {w.id === newest?.id &&
                canUndo(
                  { wateredById: w.wateredBy.id, wateredAt: w.wateredAt, undoneAt: null },
                  me.id,
                  now,
                ) && (
                  <button
                    type="button"
                    style={{ marginLeft: 'auto' }}
                    disabled={undo.isPending}
                    onClick={() => {
                      undo.mutate(w.id);
                    }}
                  >
                    Undo
                  </button>
                )}
            </li>
          ))}
        </ul>
      )}
      {undo.error && <p className="error">{errorMessage(undo.error)}</p>}
      {history.hasNextPage && (
        <button
          type="button"
          disabled={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          {history.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </section>
  );
}

function PlantView({ plant, me }: { plant: DashboardPlant; me: User }) {
  const now = useNow();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const water = useWaterPlant(plant, me);
  const remove = useDeletePlant(plant.id);
  const canEdit = useCan(plant.groupId, 'plant:update:care');
  const canDelete = useCan(plant.groupId, 'plant:delete');

  return (
    <div className="stack">
      <div className="row">
        <h1 style={{ marginRight: 'auto' }}>
          {plant.name}{' '}
          {plant.location === 'outside' && <span className="badge outside">☀ Outside</span>}
        </h1>
        <button
          type="button"
          className="primary"
          disabled={water.isPending}
          onClick={() => {
            water.mutate();
          }}
        >
          💧 Watered
        </button>
      </div>
      <div className="card stack">
        <div>
          <strong>Group:</strong> {plant.groupName}
        </div>
        <div>
          <strong>Water every:</strong> {plant.intervalDays} day
          {plant.intervalDays === 1 ? '' : 's'}
        </div>
        <div>
          <strong>Next:</strong> {formatDue(plant.nextDueAt, now, me.timeZone)} (
          {formatDateTime(plant.nextDueAt, me.timeZone)})
        </div>
        <div>
          <strong>Last watered:</strong>{' '}
          {plant.lastWatering
            ? `${formatDateTime(plant.lastWatering.at, me.timeZone)} by ${plant.lastWatering.byDisplayName}`
            : 'Never'}
        </div>
        {plant.notes && (
          <div>
            <strong>Notes:</strong> {plant.notes}
          </div>
        )}
        {(water.error ?? remove.error) && (
          <p className="error" role="alert">
            {errorMessage(water.error ?? remove.error)}
          </p>
        )}
        <div className="row">
          {canEdit && !editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(true);
              }}
            >
              Edit
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className="danger"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`Delete ${plant.name}? Its watering history will be lost.`)) {
                  remove.mutate(undefined, { onSuccess: () => void navigate('/') });
                }
              }}
            >
              Delete plant
            </button>
          )}
        </div>
      </div>
      {editing && (
        <EditPlantForm
          plant={plant}
          onDone={() => {
            setEditing(false);
          }}
        />
      )}
      <History plantId={plant.id} me={me} now={now} />
    </div>
  );
}

export function PlantDetail() {
  const { id = '' } = useParams();
  const me = useCurrentUser();
  const plant = usePlant(id);

  if (plant.isPending) return <p className="muted">Loading…</p>;
  if (plant.isError) {
    return isApiError(plant.error, 404) ? (
      <NotFound />
    ) : (
      <p className="error">{errorMessage(plant.error)}</p>
    );
  }
  return <PlantView plant={plant.data} me={me} />;
}
