import { useQueryClient } from '@tanstack/react-query';
import {
  eventNames,
  eventSchemas,
  type DashboardPlant,
  type DashboardResponse,
  type EventName,
  type RealtimeEvent,
} from '@water/shared';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { io } from 'socket.io-client';
import { useMe } from '../api/auth';
import { newerPlant } from '../api/cache';
import { keys } from '../api/plants';
import { applyEvent } from './applyEvent';

/** Validate an incoming payload with the shared schema; invalid payloads are dropped. */
function parseEvent(type: EventName, payload: unknown): RealtimeEvent | null {
  const result = eventSchemas[type].safeParse(payload);
  if (!result.success) {
    console.warn(`Dropped invalid ${type} event`, result.error.issues);
    return null;
  }
  // Justified cast: TS cannot correlate `type` with `result.data` across the union, but each
  // schema in eventSchemas is keyed by its own event name, so the pair is always consistent.
  return { type, payload: result.data } as RealtimeEvent;
}

/**
 * Keeps the React Query cache in sync with server pushes (FR-018). Mount once, inside the
 * authenticated layout. Returns a notice to show when access to a group was revoked.
 */
export function useRealtime(): { notice: string | null; dismiss: () => void } {
  const qc = useQueryClient();
  const me = useMe().data;
  const navigate = useNavigate();
  const location = useLocation();
  const [notice, setNotice] = useState<string | null>(null);
  const userId = me?.id;
  const pathname = location.pathname;

  useEffect(() => {
    if (!userId) return;
    const socket = io({ withCredentials: true });

    const onEvent = (event: RealtimeEvent): void => {
      qc.setQueryData<DashboardResponse>(keys.dashboard, (d) => applyEvent(d, event));

      switch (event.type) {
        case 'plant:created':
        case 'plant:updated':
        case 'plant:watered':
        case 'plant:watering-undone': {
          const { plant } = event.payload;
          qc.setQueryData<DashboardPlant>(keys.plant(plant.id), (p) =>
            p ? newerPlant(p, plant) : p,
          );
          if (event.type !== 'plant:updated' && event.type !== 'plant:created') {
            void qc.invalidateQueries({ queryKey: keys.history(plant.id) });
          }
          break;
        }
        case 'plant:deleted':
          qc.removeQueries({ queryKey: keys.plant(event.payload.plantId) });
          break;
        case 'group:updated':
          void qc.invalidateQueries({ queryKey: keys.groups });
          break;
        case 'group:member-joined':
        case 'group:member-left':
          void qc.invalidateQueries({ queryKey: keys.members(event.payload.groupId) });
          break;
        case 'invitation:received':
          void qc.invalidateQueries({ queryKey: keys.myInvitations });
          break;
        case 'group:access-revoked':
        case 'group:deleted': {
          const { groupId } = event.payload;
          // Is the user currently looking at something in this group?
          const plantMatch = /^\/plants\/([^/]+)/.exec(window.location.pathname);
          const viewedPlant = plantMatch?.[1]
            ? qc.getQueryData<DashboardPlant>(keys.plant(plantMatch[1]))
            : undefined;
          const onGroupPage = window.location.pathname.startsWith(`/groups/${groupId}`);
          qc.removeQueries({ queryKey: keys.members(groupId) });
          void qc.invalidateQueries({ queryKey: keys.groups });
          if (viewedPlant?.groupId === groupId || onGroupPage) {
            setNotice('You no longer have access to that group.');
            void navigate('/');
          }
          break;
        }
      }
    };

    for (const name of eventNames) {
      socket.on(name, (payload: unknown) => {
        const event = parseEvent(name, payload);
        if (event) onEvent(event);
      });
    }

    // Catch up on anything missed while disconnected (Story 3, scenario 3).
    socket.on('connect', () => {
      void qc.invalidateQueries({ queryKey: keys.dashboard });
      void qc.invalidateQueries({ queryKey: keys.myInvitations });
      void qc.invalidateQueries({ queryKey: keys.groups });
    });

    return () => {
      socket.disconnect();
    };
  }, [userId, qc, navigate]);

  // Clear the notice once the user navigates somewhere else.
  useEffect(() => {
    if (pathname !== '/') setNotice(null);
  }, [pathname]);

  return {
    notice,
    dismiss: () => {
      setNotice(null);
    },
  };
}
