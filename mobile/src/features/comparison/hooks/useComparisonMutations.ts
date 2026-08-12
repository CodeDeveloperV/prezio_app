import { useMutation } from '@tanstack/react-query';

import { compareShoppingList } from '../api/comparisonApi';

import type { CompareShoppingListRequest, ShoppingListComparisonResult } from '@prezio/shared-types';

export function useCompareShoppingListMutation() {
  return useMutation<ShoppingListComparisonResult, Error, { shoppingListId: number; request: CompareShoppingListRequest }>({
    mutationFn: ({ shoppingListId, request }) => compareShoppingList(shoppingListId, request),
  });
}
