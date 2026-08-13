import { Model } from '@nozbe/watermelondb';
import { date, field, relation } from '@nozbe/watermelondb/decorators';

import type { Relation } from '@nozbe/watermelondb';
import type ShoppingList from './ShoppingList';

export default class ShoppingListItem extends Model {
  static table = 'shopping_list_items';
  static associations = {
    shopping_lists: { type: 'belongs_to' as const, key: 'shopping_list_id' },
  };

  @field('server_id') serverId!: string | null;
  @field('shopping_list_id') shoppingListId!: string;
  @field('product_id') productId!: string | null;
  @field('product_name') productName!: string;
  @field('quantity') quantity!: number;
  @field('checked') checked!: boolean;
  @field('added_by') addedBy!: string | null;
  // Mirrors the backend's ShoppingListItem.version (optimistic concurrency) -- null/1 for an
  // item that hasn't synced yet.
  @field('version') version!: number;
  @field('synced') synced!: boolean;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @relation('shopping_lists', 'shopping_list_id') shoppingList!: Relation<ShoppingList>;
}
