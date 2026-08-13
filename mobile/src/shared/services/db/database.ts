import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { migrations } from './migrations';
import { schema } from './schema';
import PendingAction from './models/PendingAction';
import Product from './models/Product';
import ProductAlias from './models/ProductAlias';
import ProductBarcode from './models/ProductBarcode';
import ShoppingList from './models/ShoppingList';
import ShoppingListItem from './models/ShoppingListItem';
import Store from './models/Store';
import StoreBranch from './models/StoreBranch';
import StoreProduct from './models/StoreProduct';

// Jest has no native SQLite module to link against, so tests run on WatermelonDB's pure-JS
// LokiJSAdapter instead -- same schema/migrations, no native dependency. `jest` is only a global
// inside the Jest runtime, never in the real app.
const isTestEnvironment = typeof jest !== 'undefined';

const adapter =
  isTestEnvironment
    ? new LokiJSAdapter({
        schema,
        migrations,
        useWebWorker: false,
        useIncrementalIndexedDB: false,
      })
    : new SQLiteAdapter({
        schema,
        migrations,
        // `jsi: false` matches the default autolinked native module
        // (@nozbe/watermelondb's `native/android`); the faster JSI adapter
        // (`native/android-jsi`) needs extra manual Gradle wiring, skipped here.
        jsi: false,
        onSetUpError: (error) => {
          console.error('[WatermelonDB] failed to set up database', error);
        },
      });

export const database = new Database({
  adapter,
  modelClasses: [
    ShoppingList,
    ShoppingListItem,
    PendingAction,
    Product,
    ProductBarcode,
    ProductAlias,
    Store,
    StoreBranch,
    StoreProduct,
  ],
});
