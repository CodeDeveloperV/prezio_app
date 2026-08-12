import { Model } from '@nozbe/watermelondb';
import { children, date, field } from '@nozbe/watermelondb/decorators';

import type { Query } from '@nozbe/watermelondb';
import type ShoppingListItem from './ShoppingListItem';

export default class ShoppingList extends Model {
  static table = 'shopping_lists';
  static associations = {
    shopping_list_items: { type: 'has_many' as const, foreignKey: 'shopping_list_id' },
  };

  @field('server_id') serverId!: string | null;
  @field('name') name!: string;
  @field('owner_user_id') ownerUserId!: string | null;
  @field('synced') synced!: boolean;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @children('shopping_list_items') items!: Query<ShoppingListItem>;
}
