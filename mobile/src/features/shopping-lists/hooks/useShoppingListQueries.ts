import { useQuery } from '@tanstack/react-query';

import { getShoppingList, listShoppingListItems, listShoppingListMembers } from '../api/shoppingListsApi';

import type { ShoppingList, ShoppingListItem, ShoppingListMember } from '@prezio/shared-types';

export function useShoppingListQuery(shoppingListId: number) {
  return useQuery<ShoppingList, Error>({
    queryKey: ['shoppingLists', shoppingListId],
    queryFn: () => getShoppingList(shoppingListId),
  });
}

export function useShoppingListMembersQuery(shoppingListId: number) {
  return useQuery<ShoppingListMember[], Error>({
    queryKey: ['shoppingListMembers', shoppingListId],
    queryFn: () => listShoppingListMembers(shoppingListId),
  });
}

export function useShoppingListItemsQuery(shoppingListId: number) {
  return useQuery<ShoppingListItem[], Error>({
    queryKey: ['shoppingListItems', shoppingListId],
    queryFn: () => listShoppingListItems(shoppingListId),
  });
}
