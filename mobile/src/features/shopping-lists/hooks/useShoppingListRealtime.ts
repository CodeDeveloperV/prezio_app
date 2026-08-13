import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Q } from '@nozbe/watermelondb';

import {
  shoppingListWsClient,
  type ShoppingListWsStatus,
} from '../../../shared/services/ws/shoppingListWsClient';
import { database } from '../../../shared/services/db/database';
import { hasUnresolvedActionForEntity } from '../../../shared/services/db/pendingActionQueue';

import type ShoppingListItem from '../../../shared/services/db/models/ShoppingListItem';
import type { ShoppingListEvent, ShoppingListItemEvent } from '@prezio/shared-types';

const shoppingListItems = () => database.get<ShoppingListItem>('shopping_list_items');

/** While online, item/member/list events write straight into WatermelonDB (item_*) or invalidate
 * React Query (member/list events, which stay online-only concepts -- see
 * ShoppingListDetailScreen) so the UI updates via `.observe()`, never only via a cache
 * invalidation for the offline-editable data. An event whose `version` is behind a local record
 * that a PendingAction still owns is dropped -- the SyncEngine, not a live event, resolves that
 * record's next state. */
export async function applyItemEvent(listLocalId: string, event: ShoppingListItemEvent): Promise<void> {
  const dto = event.payload;
  const existing = await shoppingListItems()
    .query(Q.where('shopping_list_id', listLocalId), Q.where('server_id', String(dto.id)))
    .fetch();
  const local = existing[0];

  if (event.event_type === 'item_removed') {
    if (!local) {
      return;
    }
    if (await hasUnresolvedActionForEntity(local.id)) {
      return;
    }
    await database.write(async () => {
      await local.destroyPermanently();
    });
    return;
  }

  if (local) {
    if (await hasUnresolvedActionForEntity(local.id)) {
      return;
    }
    if (event.version !== null && event.version < local.version) {
      return;
    }
    await database.write(async () => {
      await local.update((item) => {
        item.quantity = dto.quantity;
        item.checked = dto.checked;
        item.addedBy = String(dto.added_by);
        item.version = dto.version;
        item.synced = true;
      });
    });
    return;
  }

  await database.write(async () => {
    await shoppingListItems().create((item) => {
      item.serverId = String(dto.id);
      item.shoppingListId = listLocalId;
      item.productId = String(dto.product_id);
      item.productName = `Producto #${dto.product_id}`;
      item.quantity = dto.quantity;
      item.checked = dto.checked;
      item.addedBy = String(dto.added_by);
      item.version = dto.version;
      item.synced = true;
    });
  });
}

function handleEvent(
  queryClient: ReturnType<typeof useQueryClient>,
  listLocalId: string,
  serverId: number,
  event: ShoppingListEvent,
) {
  switch (event.event_type) {
    case 'item_added':
    case 'item_updated':
    case 'item_removed':
      applyItemEvent(listLocalId, event as unknown as ShoppingListItemEvent);
      break;
    case 'member_joined':
    case 'member_left':
    case 'invitation_accepted':
      queryClient.invalidateQueries({ queryKey: ['shoppingListMembers', serverId] });
      break;
    case 'list_archived':
      queryClient.invalidateQueries({ queryKey: ['shoppingLists', serverId] });
      break;
    default:
      break;
  }
}

/** Subscribes to a shopping list's real-time topic for as long as the screen is mounted, and
 * keeps the WS connection status (used to show a "reconectando..." indicator) up to date.
 * `serverId` is undefined for a list that hasn't synced yet -- there's nothing to subscribe to
 * remotely until it has a backend id. */
export function useShoppingListRealtime(listLocalId: string, serverId: number | undefined) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ShoppingListWsStatus>(shoppingListWsClient.getStatus());

  useEffect(() => {
    return shoppingListWsClient.subscribeToStatus(setStatus);
  }, []);

  useEffect(() => {
    if (serverId === undefined) {
      return undefined;
    }
    return shoppingListWsClient.subscribeToList(serverId, (event) => {
      handleEvent(queryClient, listLocalId, serverId, event);
    });
  }, [queryClient, listLocalId, serverId]);

  return { connectionStatus: status };
}

/** Subscribes to the caller's personal invitation channel (invitation_created) so the
 * "Invitaciones" screen updates live without the invitee needing to be a list member yet. */
export function useInvitationsRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    return shoppingListWsClient.subscribeToInvitations(() => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
    });
  }, [queryClient]);
}
