import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  addShoppingListItem,
  archiveShoppingList,
  createShoppingList,
  deleteShoppingList,
  deleteShoppingListItem,
  inviteToShoppingList,
  removeShoppingListMember,
  updateShoppingListItem,
} from '../api/shoppingListsApi';

import type {
  ShoppingList,
  ShoppingListCreate,
  ShoppingListInvitation,
  ShoppingListInvitationCreate,
  ShoppingListItem,
  ShoppingListItemCreate,
  ShoppingListItemUpdate,
} from '@prezio/shared-types';

export function useCreateShoppingListMutation() {
  const queryClient = useQueryClient();
  return useMutation<ShoppingList, Error, ShoppingListCreate>({
    mutationFn: createShoppingList,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shoppingLists'] }),
  });
}

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

export function useAddShoppingListItemMutation(shoppingListId: number) {
  const queryClient = useQueryClient();
  return useMutation<ShoppingListItem, Error, ShoppingListItemCreate>({
    mutationFn: (request: ShoppingListItemCreate) => addShoppingListItem(shoppingListId, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shoppingListItems', shoppingListId] }),
  });
}

// Version conflicts surface as HTTP 409 (ShoppingListItemConflictResponse) -- same
// optimistic-concurrency pattern as pricing's update, left to the caller to handle
// (see ShoppingListDetailScreen), not swallowed here.
export function useUpdateShoppingListItemMutation(shoppingListId: number) {
  const queryClient = useQueryClient();
  return useMutation<ShoppingListItem, Error, { itemId: number; request: ShoppingListItemUpdate }>({
    mutationFn: ({ itemId, request }) => updateShoppingListItem(shoppingListId, itemId, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shoppingListItems', shoppingListId] }),
  });
}

export function useDeleteShoppingListItemMutation(shoppingListId: number) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (itemId: number) => deleteShoppingListItem(shoppingListId, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shoppingListItems', shoppingListId] }),
  });
}

export function useInviteToShoppingListMutation(shoppingListId: number) {
  return useMutation<ShoppingListInvitation, Error, ShoppingListInvitationCreate>({
    mutationFn: (request: ShoppingListInvitationCreate) => inviteToShoppingList(shoppingListId, request),
  });
}
