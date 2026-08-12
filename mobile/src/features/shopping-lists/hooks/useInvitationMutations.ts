import { useMutation, useQueryClient } from '@tanstack/react-query';

import { acceptInvitation, declineInvitation, revokeInvitation } from '../api/invitationsApi';

import type { ShoppingListInvitation } from '@prezio/shared-types';

export function useAcceptInvitationMutation() {
  const queryClient = useQueryClient();
  return useMutation<ShoppingListInvitation, Error, number>({
    mutationFn: acceptInvitation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      queryClient.invalidateQueries({ queryKey: ['shoppingLists'] });
    },
  });
}

export function useDeclineInvitationMutation() {
  const queryClient = useQueryClient();
  return useMutation<ShoppingListInvitation, Error, number>({
    mutationFn: declineInvitation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invitations'] }),
  });
}

export function useRevokeInvitationMutation() {
  const queryClient = useQueryClient();
  return useMutation<ShoppingListInvitation, Error, number>({
    mutationFn: revokeInvitation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invitations'] }),
  });
}
