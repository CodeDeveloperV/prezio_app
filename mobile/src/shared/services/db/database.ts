import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { schema } from './schema';
import PendingAction from './models/PendingAction';
import ShoppingList from './models/ShoppingList';
import ShoppingListItem from './models/ShoppingListItem';

const adapter = new SQLiteAdapter({
  schema,
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
  modelClasses: [ShoppingList, ShoppingListItem, PendingAction],
});
