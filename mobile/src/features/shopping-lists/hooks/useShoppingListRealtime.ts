import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  shoppingListWsClient,
  type ShoppingListWsStatus,
} from '../../../shared/services/ws/shoppingListWsClient';

import type { ShoppingListEvent } from '@prezio/shared-types';

// The backend is the source of truth for every event (see ShoppingListEvent) -- these handlers
// only invalidate TanStack Query caches so screens re-fetch, they never merge `payload` in as a
// second copy of state.
function invalidateForEvent(
  queryClient: ReturnType<typeof useQueryClient>,
  shoppingListId: number,
  event: ShoppingListEvent,
) {
  switch (event.event_type) {
    case 'item_added':
    case 'item_updated':
    case 'item_removed':
      queryClient.invalidateQueries({ queryKey: ['shoppingListItems', shoppingListId] });
      break;
    case 'member_joined':
    case 'member_left':
      queryClient.invalidateQueries({ queryKey: ['shoppingListMembers', shoppingListId] });
      break;
    case 'invitation_accepted':
      queryClient.invalidateQueries({ queryKey: ['shoppingListMembers', shoppingListId] });
      break;
    case 'invitation_declined':
      break;
    case 'list_archived':
      queryClient.invalidateQueries({ queryKey: ['shoppingLists', shoppingListId] });
      break;
    default:
      break;
  }
}

/** Subscribes to a shopping list's real-time topic for as long as the screen is mounted, and
 * keeps the WS connection status (used to show a "reconectando..." indicator) up to date. */
export function useShoppingListRealtime(shoppingListId: number) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ShoppingListWsStatus>(shoppingListWsClient.getStatus());

  useEffect(() => {
    return shoppingListWsClient.subscribeToStatus(setStatus);
  }, []);

  useEffect(() => {
    return shoppingListWsClient.subscribeToList(shoppingListId, (event) => {
      invalidateForEvent(queryClient, shoppingListId, event);
    });
  }, [queryClient, shoppingListId]);

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
