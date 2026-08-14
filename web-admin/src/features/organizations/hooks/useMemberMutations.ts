import { useMutation, useQueryClient } from '@tanstack/react-query';

import { inviteMember, removeMember, updateMember } from '../api/membersApi';

import type { OrganizationMemberInvite, OrganizationMemberUpdate } from '@prezio/shared-types';

export function useInviteMember(storeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: OrganizationMemberInvite) => inviteMember(storeId as number, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['b2b', 'organizations', storeId, 'members'] });
    },
  });
}

export function useUpdateMember(storeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, payload }: { memberId: number; payload: OrganizationMemberUpdate }) =>
      updateMember(storeId as number, memberId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['b2b', 'organizations', storeId, 'members'] });
    },
  });
}

export function useRemoveMember(storeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: number) => removeMember(storeId as number, memberId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['b2b', 'organizations', storeId, 'members'] });
    },
  });
}
