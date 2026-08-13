import { schemaMigrations, createTable, addColumns, unsafeExecuteSql } from '@nozbe/watermelondb/Schema/migrations';

/**
 * v1 -> v2 (Epic 14 - offline mode).
 *
 * `pending_actions` had zero real rows in the wild (the sync engine that would have written to
 * it never shipped), so its v1 shape is dropped and recreated rather than migrated column by
 * column -- there's no user data to preserve.
 */
export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 3,
      steps: [
        addColumns({
          table: 'pending_actions',
          // Backfills existing rows to 0 -- harmless since v2 never shipped a working sync
          // engine, so there are no real pending rows whose relative order matters yet.
          columns: [{ name: 'sequence', type: 'number' }],
        }),
      ],
    },
    {
      toVersion: 2,
      steps: [
        unsafeExecuteSql('DROP TABLE IF EXISTS pending_actions;'),
        createTable({
          name: 'pending_actions',
          columns: [
            { name: 'action_type', type: 'string' },
            { name: 'entity_type', type: 'string' },
            { name: 'entity_local_id', type: 'string', isIndexed: true },
            { name: 'shopping_list_local_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'payload', type: 'string' },
            { name: 'base_version', type: 'number', isOptional: true },
            { name: 'status', type: 'string', isIndexed: true },
            { name: 'retry_count', type: 'number' },
            { name: 'last_error', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
            { name: 'synced_at', type: 'number', isOptional: true },
          ],
        }),
        addColumns({
          table: 'shopping_list_items',
          columns: [{ name: 'version', type: 'number' }],
        }),
        createTable({
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
        createTable({
          name: 'product_barcodes',
          columns: [
            { name: 'product_id', type: 'string', isIndexed: true },
            { name: 'barcode', type: 'string', isIndexed: true },
            { name: 'barcode_type', type: 'string' },
            { name: 'store_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'cached_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'product_aliases',
          columns: [
            { name: 'product_id', type: 'string', isIndexed: true },
            { name: 'alias', type: 'string', isIndexed: true },
            { name: 'language', type: 'string' },
            { name: 'cached_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'stores',
          columns: [
            { name: 'name', type: 'string' },
            { name: 'country', type: 'string' },
            { name: 'cached_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'store_branches',
          columns: [
            { name: 'store_id', type: 'string', isIndexed: true },
            { name: 'name', type: 'string' },
            { name: 'city', type: 'string' },
            { name: 'cached_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'store_products',
          columns: [
            { name: 'store_branch_id', type: 'string', isIndexed: true },
            { name: 'product_id', type: 'string', isIndexed: true },
            { name: 'current_price', type: 'number' },
            { name: 'currency', type: 'string' },
            { name: 'version', type: 'number' },
            { name: 'availability', type: 'string' },
            { name: 'last_verified_at', type: 'number', isOptional: true },
            { name: 'cached_at', type: 'number' },
          ],
        }),
      ],
    },
  ],
});
