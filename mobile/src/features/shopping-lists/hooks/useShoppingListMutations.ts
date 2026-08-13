import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  archiveShoppingList,
  deleteShoppingList,
  inviteToShoppingList,
  removeShoppingListMember,
} from '../api/shoppingListsApi';

import type { ShoppingList, ShoppingListInvitation, ShoppingListInvitationCreate } from '@prezio/shared-types';

// Creating/editing lists and items is offline-first now (see offlineShoppingListActions.ts +
// useOfflineShoppingLists) and no longer goes through React Query mutations. What's left here is
// online-only by design: archiving, deleting a list outright, membership, and invites.

export function useArchiveShoppingListMutation() {
  const queryClient = useQueryClient();
  return useMutation<ShoppingList, Error, number>({
    mutationFn: archiveShoppingList,
    onSuccess: (_, shoppingListId) => {
      queryClient.invalidateQueries({ queryKey: ['shoppingLists'] });
      queryClient.invalidateQueries({ queryKey: ['shoppingLists', shoppingListId] });
    },
  });
}

export function useDeleteShoppingListMutation() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: deleteShoppingList,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shoppingLists'] }),
  });
}

export function useRemoveShoppingListMemberMutation(shoppingListId: number) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (userId: number) => removeShoppingListMember(shoppingListId, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shoppingListMembers', shoppingListId] }),
  });
}

export function useInviteToShoppingListMutation(shoppingListId: number) {
  return useMutation<ShoppingListInvitation, Error, ShoppingListInvitationCreate>({
    mutationFn: (request: ShoppingListInvitationCreate) => inviteToShoppingList(shoppingListId, request),
  });
}
