import { canUndo, classifyPlant, type DashboardPlant, type User } from '@water/shared';
import { Link } from 'react-router';
import { errorMessage } from '../api/client';
import { useCan, useUndoWatering, useUpdatePlant, useWaterPlant } from '../api/plants';
import { formatDue, formatRelative } from '../lib/format';

interface Props {
  plant: DashboardPlant;
  me: User;
  now: Date;
}

export function PlantCard({ plant, me, now }: Props) {
  const water = useWaterPlant(plant, me);
  const update = useUpdatePlant(plant.id);
  const undo = useUndoWatering();
  const canToggle = useCan(plant.groupId, 'plant:update:care');

  const status = classifyPlant(plant.nextDueAt, now, me.timeZone);
  const last = plant.lastWatering;
  const undoable =
    last !== null &&
    last.id !== 'pending' &&
    canUndo({ wateredById: last.byUserId, wateredAt: last.at, undoneAt: null }, me.id, now);
  const error = water.error ?? update.error ?? undo.error;

  return (
    <li className="card plant-card" data-testid={`plant-${plant.name}`}>
      <div>
        <h3>
          <Link to={`/plants/${plant.id}`}>{plant.name}</Link>{' '}
          {plant.location === 'outside' && <span className="badge outside">☀ Outside</span>}
        </h3>
        <div className="muted">{plant.groupName}</div>
        <div className="muted">
          {last
            ? `Last watered ${formatRelative(last.at, now)} by ${last.byDisplayName}`
            : 'Never watered'}
        </div>
        <div>
          <span className={status === 'needs_water' ? 'badge due' : 'muted'}>
            {formatDue(plant.nextDueAt, now, me.timeZone)}
          </span>
        </div>
        {error && (
          <div className="error" role="alert">
            {errorMessage(error)}
          </div>
        )}
      </div>
      <div className="actions">
        {canToggle && (
          <button
            type="button"
            disabled={update.isPending}
            aria-label={`Move ${plant.name} ${plant.location === 'outside' ? 'inside' : 'outside'}`}
            onClick={() => {
              update.mutate({ location: plant.location === 'outside' ? 'inside' : 'outside' });
            }}
          >
            {plant.location === 'outside' ? 'Bring inside' : 'Move outside'}
          </button>
        )}
        {undoable ? (
          <button
            type="button"
            disabled={undo.isPending}
            aria-label={`Undo watering ${plant.name}`}
            onClick={() => {
              undo.mutate(last.id);
            }}
          >
            Undo
          </button>
        ) : null}
        <button
          type="button"
          className="primary"
          disabled={water.isPending}
          aria-label={`Mark ${plant.name} watered`}
          onClick={() => {
            water.mutate();
          }}
        >
          💧 Watered
        </button>
      </div>
    </li>
  );
}
