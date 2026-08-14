import { useMutation, useQueryClient } from '@tanstack/react-query';

import { database } from '../../../shared/services/db/database';
import {
  archiveShoppingList,
  deleteShoppingList,
  inviteToShoppingList,
  removeShoppingListMember,
  setShoppingListActiveBranch,
} from '../api/shoppingListsApi';

import type ShoppingListModel from '../../../shared/services/db/models/ShoppingList';
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

// Setting the active branch is online-only, like archiving -- but the detail screen reads the
// list from WatermelonDB (Epic 14), so on success we also write the new value onto the local
// record rather than waiting on the next pullShoppingLists() to pick it up.
export function useSetActiveBranchMutation(shoppingListId: number, shoppingListLocalId: string) {
  const queryClient = useQueryClient();
  return useMutation<ShoppingList, Error, number>({
    mutationFn: (storeBranchId: number) =>
      setShoppingListActiveBranch(shoppingListId, { store_branch_id: storeBranchId }),
    onSuccess: async (updated) => {
      const localLists = database.get<ShoppingListModel>('shopping_lists');
      const local = await localLists.find(shoppingListLocalId);
      await database.write(async () => {
        await local.update((list) => {
          list.activeStoreBranchId =
            updated.active_store_branch_id !== null ? String(updated.active_store_branch_id) : null;
        });
      });
      queryClient.invalidateQueries({ queryKey: ['shoppingLists', shoppingListId] });
    },
  });
}
