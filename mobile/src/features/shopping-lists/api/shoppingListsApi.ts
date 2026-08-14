import { httpClient } from '../../../shared/services/api/httpClient';

import type {
  ShoppingList,
  ShoppingListActiveBranchUpdate,
  ShoppingListCreate,
  ShoppingListInvitation,
  ShoppingListInvitationCreate,
  ShoppingListItem,
  ShoppingListItemCreate,
  ShoppingListItemUpdate,
  ShoppingListMember,
} from '@prezio/shared-types';

export function listShoppingLists(): Promise<ShoppingList[]> {
  return httpClient.get('shopping-lists').json<ShoppingList[]>();
}

export function createShoppingList(request: ShoppingListCreate): Promise<ShoppingList> {
  return httpClient.post('shopping-lists', { json: request }).json<ShoppingList>();
}

export function getShoppingList(shoppingListId: number): Promise<ShoppingList> {
  return httpClient.get(`shopping-lists/${shoppingListId}`).json<ShoppingList>();
}

export function archiveShoppingList(shoppingListId: number): Promise<ShoppingList> {
  return httpClient.post(`shopping-lists/${shoppingListId}/archive`).json<ShoppingList>();
}

export function setShoppingListActiveBranch(
  shoppingListId: number,
  request: ShoppingListActiveBranchUpdate,
): Promise<ShoppingList> {
  return httpClient
    .patch(`shopping-lists/${shoppingListId}/active-branch`, { json: request })
    .json<ShoppingList>();
}

export function deleteShoppingList(shoppingListId: number): Promise<void> {
  return httpClient.delete(`shopping-lists/${shoppingListId}`).then(() => undefined);
}

export function listShoppingListMembers(shoppingListId: number): Promise<ShoppingListMember[]> {
  return httpClient.get(`shopping-lists/${shoppingListId}/members`).json<ShoppingListMember[]>();
}

export function removeShoppingListMember(shoppingListId: number, userId: number): Promise<void> {
  return httpClient.delete(`shopping-lists/${shoppingListId}/members/${userId}`).then(() => undefined);
}

export function listShoppingListItems(shoppingListId: number): Promise<ShoppingListItem[]> {
  return httpClient.get(`shopping-lists/${shoppingListId}/items`).json<ShoppingListItem[]>();
}

export function addShoppingListItem(
  shoppingListId: number,
  request: ShoppingListItemCreate,
): Promise<ShoppingListItem> {
  return httpClient
    .post(`shopping-lists/${shoppingListId}/items`, { json: request })
    .json<ShoppingListItem>();
}

export function updateShoppingListItem(
  shoppingListId: number,
  itemId: number,
  request: ShoppingListItemUpdate,
): Promise<ShoppingListItem> {
  return httpClient
    .patch(`shopping-lists/${shoppingListId}/items/${itemId}`, { json: request })
    .json<ShoppingListItem>();
}

export function deleteShoppingListItem(shoppingListId: number, itemId: number): Promise<void> {
  return httpClient.delete(`shopping-lists/${shoppingListId}/items/${itemId}`).then(() => undefined);
}

export function inviteToShoppingList(
  shoppingListId: number,
  request: ShoppingListInvitationCreate,
): Promise<ShoppingListInvitation> {
  return httpClient
    .post(`shopping-lists/${shoppingListId}/invitations`, { json: request })
    .json<ShoppingListInvitation>();
}
