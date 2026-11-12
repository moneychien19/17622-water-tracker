import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  can,
  DashboardResponseSchema,
  GroupResponseSchema,
  GroupsResponseSchema,
  PlantResponseSchema,
  WateringHistoryPageSchema,
  WateringResponseSchema,
  type Action,
  type CreateGroupBody,
  type CreatePlantBody,
  type DashboardPlant,
  type DashboardResponse,
  type Role,
  type UpdateGroupBody,
  type UpdatePlantBody,
  type User,
} from '@water/shared';
import { newerPlant, removePlant, upsertPlant } from './cache';
import { apiFetch, apiSend } from './client';

export const keys = {
  dashboard: ['dashboard'] as const,
  groups: ['groups'] as const,
  plant: (id: string) => ['plant', id] as const,
  history: (id: string) => ['history', id] as const,
  members: (groupId: string) => ['members', groupId] as const,
  groupInvitations: (groupId: string) => ['groupInvitations', groupId] as const,
  myInvitations: ['myInvitations'] as const,
};

/** Apply a server-confirmed plant to every cache that holds it (newer version wins). */
export function storePlant(qc: QueryClient, plant: DashboardPlant): void {
  qc.setQueryData<DashboardResponse>(keys.dashboard, (d) => upsertPlant(d, plant));
  qc.setQueryData<DashboardPlant>(keys.plant(plant.id), (p) => newerPlant(p, plant));
}

export function useDashboard() {
  return useQuery({
    queryKey: keys.dashboard,
    queryFn: () => apiFetch('/dashboard', DashboardResponseSchema),
  });
}

export function useGroups() {
  return useQuery({
    queryKey: keys.groups,
    queryFn: async () => (await apiFetch('/groups', GroupsResponseSchema)).groups,
  });
}

/** The current user's role in a group, or undefined while loading / not a member. */
export function useRole(groupId: string | undefined): Role | undefined {
  const groups = useGroups();
  return groups.data?.find((g) => g.id === groupId)?.role;
}

export function useCan(groupId: string | undefined, action: Action): boolean {
  const role = useRole(groupId);
  return role !== undefined && can(role, action);
}

export function usePlant(id: string) {
  return useQuery({
    queryKey: keys.plant(id),
    queryFn: async () => (await apiFetch(`/plants/${id}`, PlantResponseSchema)).plant,
  });
}

export function useWateringHistory(id: string) {
  return useInfiniteQuery({
    queryKey: keys.history(id),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiFetch(
        `/plants/${id}/waterings${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`,
        WateringHistoryPageSchema,
      ),
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateGroupBody) =>
      (await apiFetch('/groups', GroupResponseSchema, { method: 'POST', body })).group,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.groups }),
  });
}

export function useRenameGroup(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateGroupBody) =>
      (await apiFetch(`/groups/${groupId}`, GroupResponseSchema, { method: 'PATCH', body })).group,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.groups });
      await qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => apiSend(`/groups/${groupId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.groups });
      await qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useCreatePlant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, body }: { groupId: string; body: CreatePlantBody }) =>
      (await apiFetch(`/groups/${groupId}/plants`, PlantResponseSchema, { method: 'POST', body }))
        .plant,
    onSuccess: (plant) => {
      storePlant(qc, plant);
    },
  });
}

export function useUpdatePlant(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdatePlantBody) =>
      (await apiFetch(`/plants/${id}`, PlantResponseSchema, { method: 'PATCH', body })).plant,
    onSuccess: (plant) => {
      storePlant(qc, plant);
    },
  });
}

export function useDeletePlant(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend(`/plants/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.setQueryData<DashboardResponse>(keys.dashboard, (d) => removePlant(d, id));
      qc.removeQueries({ queryKey: keys.plant(id) });
    },
  });
}

/**
 * Optimistically shows the plant as just watered, then reconciles with the server response
 * (Constitution III: server is the source of truth).
 */
export function useWaterPlant(plant: DashboardPlant, me: User) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/plants/${plant.id}/waterings`, WateringResponseSchema, { method: 'POST' }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: keys.dashboard });
      const previous = qc.getQueryData<DashboardResponse>(keys.dashboard);
      const now = new Date();
      const optimistic: DashboardPlant = {
        ...plant,
        lastWatering: { id: 'pending', at: now, byUserId: me.id, byDisplayName: me.displayName },
        nextDueAt: new Date(now.getTime() + plant.intervalDays * 86_400_000),
      };
      qc.setQueryData<DashboardResponse>(keys.dashboard, (d) =>
        d ? { ...d, plants: d.plants.map((p) => (p.id === plant.id ? optimistic : p)) } : d,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(keys.dashboard, context.previous);
    },
    onSuccess: ({ plant: confirmed }) => {
      storePlant(qc, confirmed);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.history(plant.id) }),
  });
}

export function useUndoWatering() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (wateringId: string) =>
      (await apiFetch(`/waterings/${wateringId}/undo`, PlantResponseSchema, { method: 'POST' }))
        .plant,
    onSuccess: async (plant) => {
      storePlant(qc, plant);
      await qc.invalidateQueries({ queryKey: keys.history(plant.id) });
    },
  });
}
