import { appSchema, tableSchema } from '@nozbe/watermelondb';

/**
 * Local-first WatermelonDB schema (Epic 14 - offline mode).
 *
 * Editable offline (local id is the source of truth until `server_id` is set by sync):
 * - shopping_lists, shopping_list_items
 *
 * Read-only cache, scoped to what the user has actually touched (never the full catalog) --
 * populated by the sync layer, id equals the backend's numeric id (stringified):
 * - products, product_barcodes, product_aliases, stores, store_branches, store_products
 *
 * pending_actions is the durable offline mutation queue (see PendingAction model for the
 * status/action_type contract). See ./migrations.ts for how existing installs get here from v1.
 */
export const schema = appSchema({
  version: 4,
  tables: [
    tableSchema({
      name: 'shopping_lists',
      columns: [
        // Null until the list has been created on the backend.
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'name', type: 'string' },
        { name: 'owner_user_id', type: 'string', isOptional: true },
        { name: 'synced', type: 'boolean' },
        // Epic 13: mirrors ShoppingList.active_store_branch_id. Set/changed online-only via
        // PATCH /shopping-lists/{id}/active-branch, then pulled down so the detail screen can
        // read it without a network round-trip -- never edited offline.
        { name: 'active_store_branch_id', type: 'string', isOptional: true },
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
        // Mirrors the backend's optimistic-concurrency version (ShoppingListItem.version) --
        // needed both to send `expected_version` on sync and to ignore stale WebSocket events.
        { name: 'version', type: 'number' },
        { name: 'synced', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'pending_actions',
      columns: [
        // e.g. 'create_shopping_list' | 'add_item' | 'update_item_quantity' | ...
        { name: 'action_type', type: 'string' },
        // 'shopping_list' | 'shopping_list_item' -- what this action mutates.
        { name: 'entity_type', type: 'string' },
        // Local WatermelonDB id of the affected record (stable before the record has a
        // server_id, which is what lets an ADD_ITEM action reference a not-yet-synced list).
        { name: 'entity_local_id', type: 'string', isIndexed: true },
        // Local id of the parent list, when entity_type is an item -- backs causal ordering
        // (never replay an item action before its list's create action has synced).
        { name: 'shopping_list_local_id', type: 'string', isOptional: true, isIndexed: true },
        // JSON-encoded payload; shape depends on action_type.
        { name: 'payload', type: 'string' },
        // The item version this action was built against, when relevant -- sent as
        // `expected_version` and used to detect a 409 that needs conflict resolution.
        { name: 'base_version', type: 'number', isOptional: true },
        // 'pending' | 'syncing' | 'failed' | 'conflict' | 'synced'
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'retry_count', type: 'number' },
        { name: 'last_error', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'synced_at', type: 'number', isOptional: true },
        // Monotonically increasing enqueue order -- `created_at` alone is millisecond-resolution
        // and ties when several actions are enqueued in the same tick, which breaks causal FIFO
        // replay (see migration v3).
        { name: 'sequence', type: 'number', isIndexed: true },
      ],
    }),
    tableSchema({
      name: 'products',
      columns: [
        { name: 'canonical_name', type: 'string' },
        { name: 'brand_name', type: 'string', isOptional: true },
        { name: 'category_name', type: 'string', isOptional: true },
        { name: 'presentation', type: 'string', isOptional: true },
        { name: 'image_url', type: 'string', isOptional: true },
        { name: 'cached_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'product_barcodes',
      columns: [
        { name: 'product_id', type: 'string', isIndexed: true },
        { name: 'barcode', type: 'string', isIndexed: true },
        { name: 'barcode_type', type: 'string' },
        { name: 'store_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'cached_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'product_aliases',
      columns: [
        { name: 'product_id', type: 'string', isIndexed: true },
        { name: 'alias', type: 'string', isIndexed: true },
        { name: 'language', type: 'string' },
        { name: 'cached_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'stores',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'country', type: 'string' },
        { name: 'cached_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'store_branches',
      columns: [
        { name: 'store_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'city', type: 'string' },
        { name: 'cached_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'store_products',
      columns: [
        { name: 'store_branch_id', type: 'string', isIndexed: true },
        { name: 'product_id', type: 'string', isIndexed: true },
        { name: 'current_price', type: 'number' },
        { name: 'currency', type: 'string' },
        // Mirrors StoreProduct.version -- a cached price is a snapshot, never a write target;
        // offline pricing edits are out of scope for this epic.
        { name: 'version', type: 'number' },
        { name: 'availability', type: 'string' },
        { name: 'last_verified_at', type: 'number', isOptional: true },
        { name: 'cached_at', type: 'number' },
      ],
    }),
  ],
});
