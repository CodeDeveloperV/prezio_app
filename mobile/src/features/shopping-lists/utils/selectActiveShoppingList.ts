import type { ShoppingList } from '@prezio/shared-types';

export function selectActiveShoppingList(lists: ShoppingList[] | undefined | null): ShoppingList | null {
  return (
    lists
      ?.slice()
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
      .find((list) => list.status === 'active') ?? null
  );
}
