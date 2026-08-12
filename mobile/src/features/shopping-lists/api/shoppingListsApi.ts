import { httpClient } from '../../../shared/services/api/httpClient';

import type { ShoppingList } from '@prezio/shared-types';

export function listShoppingLists(): Promise<ShoppingList[]> {
  return httpClient.get('shopping-lists').json<ShoppingList[]>();
}
