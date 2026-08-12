import { httpClient } from '../../../shared/services/api/httpClient';

import type { CompareShoppingListRequest, ShoppingListComparisonResult } from '@prezio/shared-types';

export function compareShoppingList(
  shoppingListId: number,
  request: CompareShoppingListRequest,
): Promise<ShoppingListComparisonResult> {
  return httpClient
    .post(`comparison/shopping-lists/${shoppingListId}/compare`, { json: request })
    .json<ShoppingListComparisonResult>();
}
