import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GroupResponseSchema,
  InvitationResponseSchema,
  InvitationsResponseSchema,
  MembersResponseSchema,
  MyInvitationsResponseSchema,
} from '@water/shared';
import { apiFetch, apiSend } from './client';
import { keys } from './plants';

export function useMembers(groupId: string) {
  return useQuery({
    queryKey: keys.members(groupId),
    queryFn: async () =>
      (await apiFetch(`/groups/${groupId}/members`, MembersResponseSchema)).members,
  });
}

export function useGroupInvitations(groupId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.groupInvitations(groupId),
    queryFn: async () =>
      (await apiFetch(`/groups/${groupId}/invitations`, InvitationsResponseSchema)).invitations,
    enabled,
  });
}

export function useMyInvitations() {
  return useQuery({
    queryKey: keys.myInvitations,
    queryFn: async () =>
      (await apiFetch('/me/invitations', MyInvitationsResponseSchema)).invitations,
  });
}

export function useInvite(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) =>
      (
        await apiFetch(`/groups/${groupId}/invitations`, InvitationResponseSchema, {
          method: 'POST',
          body: { email },
        })
      ).invitation,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.groupInvitations(groupId) }),
  });
}

export function useRevokeInvite(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      apiSend(`/invitations/${invitationId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.groupInvitations(groupId) }),
  });
}

/** Remove a member, or leave the group when userId is the caller. */
export function useRemoveMember(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiSend(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.members(groupId) });
      await qc.invalidateQueries({ queryKey: keys.groups });
      await qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) =>
      (
        await apiFetch(`/invitations/${invitationId}/accept`, GroupResponseSchema, {
          method: 'POST',
        })
      ).group,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.myInvitations });
      await qc.invalidateQueries({ queryKey: keys.groups });
      await qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useDeclineInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      apiSend(`/invitations/${invitationId}/decline`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.myInvitations }),
  });
}
