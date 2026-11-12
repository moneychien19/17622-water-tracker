import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserResponseSchema, type LoginBody, type RegisterBody, type User } from '@water/shared';
import { apiFetch, apiSend, isApiError } from './client';

export const meKey = ['me'] as const;

/** The signed-in user, or null when signed out (401). */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: async (): Promise<User | null> => {
      try {
        return (await apiFetch('/auth/me', UserResponseSchema)).user;
      } catch (err) {
        if (isApiError(err, 401)) return null;
        throw err;
      }
    },
    staleTime: Infinity,
  });
}

/** Use inside routes wrapped by RequireAuth, where the user is guaranteed. */
export function useCurrentUser(): User {
  const { data } = useMe();
  if (!data) throw new Error('useCurrentUser called outside RequireAuth');
  return data;
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterBody) =>
      apiFetch('/auth/register', UserResponseSchema, { method: 'POST', body }),
    onSuccess: ({ user }) => {
      qc.clear();
      qc.setQueryData(meKey, user);
    },
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginBody) =>
      apiFetch('/auth/login', UserResponseSchema, { method: 'POST', body }),
    onSuccess: ({ user }) => {
      qc.clear();
      qc.setQueryData(meKey, user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      qc.clear();
      qc.setQueryData(meKey, null);
    },
  });
}
