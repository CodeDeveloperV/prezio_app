import { useQuery } from '@tanstack/react-query';

import { getShoppingList, listShoppingListMembers } from '../api/shoppingListsApi';

import type { ShoppingList, ShoppingListMember } from '@prezio/shared-types';

// Items and the list's own name/edit state are read from WatermelonDB now (see
// useOfflineShoppingLists) -- these two remain online-only concepts (member roles, archived
// status) not covered by this Epic's offline scope, so they stay on React Query and are simply
// disabled while the list hasn't synced yet (no server id to query with).

export function useShoppingListQuery(shoppingListId: number | undefined) {
  return useQuery<ShoppingList, Error>({
    queryKey: ['shoppingLists', shoppingListId],
    queryFn: () => getShoppingList(shoppingListId as number),
    enabled: shoppingListId !== undefined,
  });
}

export function useShoppingListMembersQuery(shoppingListId: number | undefined) {
  return useQuery<ShoppingListMember[], Error>({
    queryKey: ['shoppingListMembers', shoppingListId],
    queryFn: () => listShoppingListMembers(shoppingListId as number),
    enabled: shoppingListId !== undefined,
  });
}
