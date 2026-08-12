import { useQuery } from '@tanstack/react-query';

import { listShoppingLists } from '../api/shoppingListsApi';

import type { ShoppingList } from '@prezio/shared-types';

export function useShoppingListsQuery() {
  return useQuery<ShoppingList[], Error>({
    queryKey: ['shoppingLists'],
    queryFn: listShoppingLists,
  });
}
