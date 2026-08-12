import { httpClient } from '../../../shared/services/api/httpClient';

import type { ShoppingListInvitation } from '@prezio/shared-types';

export function listMyInvitations(): Promise<ShoppingListInvitation[]> {
  return httpClient.get('invitations').json<ShoppingListInvitation[]>();
}

export function acceptInvitation(invitationId: number): Promise<ShoppingListInvitation> {
  return httpClient.post(`invitations/${invitationId}/accept`).json<ShoppingListInvitation>();
}

export function declineInvitation(invitationId: number): Promise<ShoppingListInvitation> {
  return httpClient.post(`invitations/${invitationId}/decline`).json<ShoppingListInvitation>();
}

export function revokeInvitation(invitationId: number): Promise<ShoppingListInvitation> {
  return httpClient.post(`invitations/${invitationId}/revoke`).json<ShoppingListInvitation>();
}
