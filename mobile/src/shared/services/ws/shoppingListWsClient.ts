import { WS_BASE_URL } from '../api/config';
import { useAuthStore } from '../../store/authStore';

import type { ShoppingListEvent, ShoppingListInvitationCreatedEvent } from '@prezio/shared-types';

export type ShoppingListWsStatus = 'connected' | 'disconnected';

type ListListener = (event: ShoppingListEvent) => void;
type InvitationListener = (event: ShoppingListInvitationCreatedEvent) => void;
type StatusListener = (status: ShoppingListWsStatus) => void;

type OutboundMessage =
  | { action: 'subscribe' | 'unsubscribe'; shopping_list_id: number }
  | { action: 'subscribe_invitations' | 'unsubscribe_invitations' };

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

// Points at the backend's separate /shopping-lists/ws endpoint (own channel prefix,
// own membership-checked subscribe handshake) -- same reconnecting-topic-socket shape as
// wsClient.ts (pricing), not a second WS architecture, just a second connection/topic set.
const SHOPPING_LIST_WS_URL = `${WS_BASE_URL.replace(/\/ws$/, '')}/shopping-lists/ws`;

/**
 * WebSocket client for collaborative shopping lists: per-shopping_list_id topics (item/member/
 * list events) plus one connection-wide "invitations" topic (invitation_created), which the
 * backend always resolves to the caller's own user id -- there's no id to pass for it.
 */
class ShoppingListWsClient {
  private socket: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manuallyClosed = false;
  private readonly topicListeners = new Map<number, Set<ListListener>>();
  private readonly invitationListeners = new Set<InvitationListener>();
  private readonly statusListeners = new Set<StatusListener>();
  private status: ShoppingListWsStatus = 'disconnected';

  connect(): void {
    this.manuallyClosed = false;
    this.openSocket();
  }

  getStatus(): ShoppingListWsStatus {
    return this.status;
  }

  subscribeToStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(status: ShoppingListWsStatus) {
    if (this.status === status) {
      return;
    }
    this.status = status;
    this.statusListeners.forEach((listener) => listener(status));
  }

  disconnect(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
  }

  subscribeToList(shoppingListId: number, listener: ListListener): () => void {
    let listeners = this.topicListeners.get(shoppingListId);
    if (!listeners) {
      listeners = new Set();
      this.topicListeners.set(shoppingListId, listeners);
      this.send({ action: 'subscribe', shopping_list_id: shoppingListId });
    }
    listeners.add(listener);

    return () => {
      listeners?.delete(listener);
      if (listeners && listeners.size === 0) {
        this.topicListeners.delete(shoppingListId);
        this.send({ action: 'unsubscribe', shopping_list_id: shoppingListId });
      }
    };
  }

  subscribeToInvitations(listener: InvitationListener): () => void {
    if (this.invitationListeners.size === 0) {
      this.send({ action: 'subscribe_invitations' });
    }
    this.invitationListeners.add(listener);

    return () => {
      this.invitationListeners.delete(listener);
      if (this.invitationListeners.size === 0) {
        this.send({ action: 'unsubscribe_invitations' });
      }
    };
  }

  private openSocket() {
    const { accessToken } = useAuthStore.getState();
    const url = accessToken
      ? `${SHOPPING_LIST_WS_URL}?token=${encodeURIComponent(accessToken)}`
      : SHOPPING_LIST_WS_URL;

    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.setStatus('connected');
      // Re-subscribe to every active topic after a reconnect.
      for (const shoppingListId of this.topicListeners.keys()) {
        this.send({ action: 'subscribe', shopping_list_id: shoppingListId });
      }
      if (this.invitationListeners.size > 0) {
        this.send({ action: 'subscribe_invitations' });
      }
    };

    socket.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    socket.onerror = () => {
      // onclose fires right after; reconnect logic lives there.
    };

    socket.onclose = () => {
      this.socket = null;
      this.setStatus('disconnected');
      if (!this.manuallyClosed) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect() {
    const delay = Math.min(BASE_BACKOFF_MS * 2 ** this.reconnectAttempt, MAX_BACKOFF_MS);
    this.reconnectAttempt += 1;

    this.reconnectTimer = setTimeout(() => {
      this.openSocket();
    }, delay);
  }

  private send(message: OutboundMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
    // If not open yet, onopen re-subscribes to everything once connected.
  }

  private handleMessage(raw: string) {
    let event: ShoppingListEvent | ShoppingListInvitationCreatedEvent;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }

    if (event?.event_type === 'invitation_created') {
      this.invitationListeners.forEach((listener) => listener(event));
      return;
    }

    const listeners = this.topicListeners.get(event.shopping_list_id);
    listeners?.forEach((listener) => listener(event as ShoppingListEvent));
  }
}

export const shoppingListWsClient = new ShoppingListWsClient();
