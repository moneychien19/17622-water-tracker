import { groupDashboard, type DashboardPlant, type User } from '@water/shared';
import { useState } from 'react';
import { useCurrentUser } from '../api/auth';
import { errorMessage } from '../api/client';
import { useDashboard } from '../api/plants';
import { AddPlantForm } from '../components/AddPlantForm';
import { PlantCard } from '../components/PlantCard';
import { useNow } from '../lib/useNow';

function Section(props: {
  title: string;
  plants: DashboardPlant[];
  empty: string;
  me: User;
  now: Date;
  highlight?: boolean;
}) {
  const id = `section-${props.title.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="stack">
      <h2 id={id} className="section-title">
        {props.title}
        <span className={props.highlight && props.plants.length > 0 ? 'badge due' : 'badge'}>
          {props.plants.length}
        </span>
      </h2>
      {props.plants.length === 0 ? (
        <p className="muted">{props.empty}</p>
      ) : (
        <ul className="list-plain stack">
          {props.plants.map((p) => (
            <PlantCard key={p.id} plant={p} me={props.me} now={props.now} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function Dashboard() {
  const me = useCurrentUser();
  const now = useNow();
  const dashboard = useDashboard();
  const [outsideOnly, setOutsideOnly] = useState(false);
  const [adding, setAdding] = useState(false);

  if (dashboard.isPending) return <p className="muted">Loading plants…</p>;
  if (dashboard.isError) return <p className="error">{errorMessage(dashboard.error)}</p>;

  const plants = dashboard.data.plants;
  const outsideCount = plants.filter((p) => p.location === 'outside').length;
  const groups = groupDashboard(plants, now, me.timeZone, { outsideOnly });

  if (plants.length === 0) {
    return (
      <div className="stack">
        <h1>Your plants</h1>
        <p className="muted">No plants yet. Add your first one to start tracking watering.</p>
        <AddPlantForm />
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="row">
        <h1 style={{ marginRight: 'auto' }}>Your plants</h1>
        <label className="inline">
          <input
            type="checkbox"
            checked={outsideOnly}
            onChange={(e) => {
              setOutsideOnly(e.target.checked);
            }}
          />
          Outside only ({outsideCount})
        </label>
        <button
          type="button"
          onClick={() => {
            setAdding((v) => !v);
          }}
        >
          {adding ? 'Close' : '+ Add plant'}
        </button>
      </div>
      {adding && (
        <AddPlantForm
          onDone={() => {
            setAdding(false);
          }}
        />
      )}
      <Section
        title="Needs water"
        plants={groups.needsWater}
        empty="Nothing needs water right now. 🌿"
        me={me}
        now={now}
        highlight
      />
      <Section title="OK" plants={groups.ok} empty="—" me={me} now={now} />
    </div>
  );
}
