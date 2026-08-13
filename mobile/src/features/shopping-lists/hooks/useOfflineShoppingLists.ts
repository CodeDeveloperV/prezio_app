import { useCallback, useEffect, useState } from 'react';
import { Q } from '@nozbe/watermelondb';

import { database } from '../../../shared/services/db/database';
import { runSync } from '../services/offline/shoppingListSyncEngine';
import { pullShoppingLists, pullShoppingListItems } from '../services/offline/shoppingListPull';

import type ShoppingList from '../../../shared/services/db/models/ShoppingList';
import type ShoppingListItem from '../../../shared/services/db/models/ShoppingListItem';

const shoppingLists = () => database.get<ShoppingList>('shopping_lists');
const shoppingListItems = () => database.get<ShoppingListItem>('shopping_list_items');

/**
 * WatermelonDB is the source of truth for these reads (Epic 14): the screen renders from
 * `.observe()` and never waits on a network response. `refresh()` is a best-effort push+pull --
 * failures (offline, or nothing to sync) are swallowed since shopping must never be blocked by
 * connectivity.
 */
export function useOfflineShoppingLists() {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const subscription = shoppingLists()
      .query(Q.sortBy('created_at', Q.desc))
      .observe()
      .subscribe((records) => {
        setLists(records);
        setIsLoading(false);
      });
    return () => subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    await runSync().catch(() => undefined);
    await pullShoppingLists().catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { lists, isLoading, refresh };
}

export function useOfflineShoppingList(listLocalId: string) {
  const [list, setList] = useState<ShoppingList | null>(null);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | undefined;
    let cancelled = false;

    shoppingLists()
      .find(listLocalId)
      .then((record) => {
        if (cancelled) {
          return;
        }
        subscription = record.observe().subscribe(setList);
      })
      .catch(() => setList(null));

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [listLocalId]);

  return list;
}

export function useOfflineShoppingListItems(listLocalId: string) {
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const subscription = shoppingListItems()
      .query(Q.where('shopping_list_id', listLocalId), Q.sortBy('created_at', Q.asc))
      .observe()
      .subscribe((records) => {
        setItems(records);
        setIsLoading(false);
      });
    return () => subscription.unsubscribe();
  }, [listLocalId]);

  const refresh = useCallback(async () => {
    await runSync().catch(() => undefined);
    const list = await shoppingLists().find(listLocalId);
    if (list.serverId) {
      await pullShoppingListItems(listLocalId, Number(list.serverId)).catch(() => undefined);
    }
  }, [listLocalId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { items, isLoading, refresh };
}
