import { appSchema, tableSchema } from '@nozbe/watermelondb';

/**
 * Local-first WatermelonDB schema.
 *
 * These tables mirror the backend shape (see @prezio/shared-types
 * ShoppingList / ShoppingListItem) plus local-only bookkeeping columns
 * (`server_id`, `synced`) needed for an offline-first client. `pending_actions`
 * is a queue of offline mutations to replay once connectivity returns — only
 * the schema/model is scaffolded here, the actual sync engine is future work.
 */
export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'shopping_lists',
      columns: [
        // Null until the list has been created on the backend.
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'name', type: 'string' },
        { name: 'owner_user_id', type: 'string', isOptional: true },
        { name: 'synced', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'shopping_list_items',
      columns: [
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'shopping_list_id', type: 'string', isIndexed: true },
        { name: 'product_id', type: 'string', isOptional: true },
        { name: 'product_name', type: 'string' },
        { name: 'quantity', type: 'number' },
        { name: 'checked', type: 'boolean' },
        { name: 'added_by', type: 'string', isOptional: true },
        { name: 'synced', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'pending_actions',
      columns: [
        // e.g. 'create_shopping_list' | 'add_item' | 'check_item' | 'update_price'.
        { name: 'action_type', type: 'string' },
        // JSON-encoded payload for the action; shape depends on action_type.
        { name: 'payload', type: 'string' },
        { name: 'synced', type: 'boolean' },
        { name: 'created_at', type: 'number' },
      ],
    }),
  ],
});
