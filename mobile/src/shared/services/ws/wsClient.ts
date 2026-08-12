import { WS_BASE_URL } from '../api/config';
import { useAuthStore } from '../../store/authStore';

import type { PriceUpdateEvent } from '@prezio/shared-types';

type Listener = (event: PriceUpdateEvent) => void;

// Client -> server subscription control messages. The server is expected to
// route/broadcast PriceUpdateEvent payloads back per subscribed topic.
// store_product_id is a DB autoincrement integer, not a UUID (see shared-types).
interface SubscribeMessage {
  type: 'subscribe' | 'unsubscribe';
  storeProductId: number;
}

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

/**
 * WebSocket client with auto-reconnect + exponential backoff, and a
 * subscribe/unsubscribe API per `storeProductId` topic (matches the
 * backend's per-store_product_id pub/sub design for live price updates).
 */
class WsClient {
  private socket: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manuallyClosed = false;
  private readonly topicListeners = new Map<number, Set<Listener>>();

  connect(): void {
    this.manuallyClosed = false;
    this.openSocket();
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

  subscribe(storeProductId: number, listener: Listener): () => void {
    let listeners = this.topicListeners.get(storeProductId);
    if (!listeners) {
      listeners = new Set();
      this.topicListeners.set(storeProductId, listeners);
      this.send({ type: 'subscribe', storeProductId });
    }
    listeners.add(listener);

    return () => {
      listeners?.delete(listener);
      if (listeners && listeners.size === 0) {
        this.topicListeners.delete(storeProductId);
        this.send({ type: 'unsubscribe', storeProductId });
      }
    };
  }

  private openSocket() {
    const { accessToken } = useAuthStore.getState();
    const url = accessToken
      ? `${WS_BASE_URL}?token=${encodeURIComponent(accessToken)}`
      : WS_BASE_URL;

    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      // Re-subscribe to all active topics after a reconnect.
      for (const storeProductId of this.topicListeners.keys()) {
        this.send({ type: 'subscribe', storeProductId });
      }
    };

    socket.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    socket.onerror = () => {
      // onclose will fire right after; reconnect logic lives there.
    };

    socket.onclose = () => {
      this.socket = null;
      if (!this.manuallyClosed) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect() {
    const delay = Math.min(
      BASE_BACKOFF_MS * 2 ** this.reconnectAttempt,
      MAX_BACKOFF_MS,
    );
    this.reconnectAttempt += 1;

    this.reconnectTimer = setTimeout(() => {
      this.openSocket();
    }, delay);
  }

  private send(message: SubscribeMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
    // If not open yet, onopen will re-subscribe to everything in
    // topicListeners once the connection is established.
  }

  private handleMessage(raw: string) {
    let event: PriceUpdateEvent;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }

    if (event?.type !== 'price_update') {
      return;
    }

    const listeners = this.topicListeners.get(event.store_product_id);
    listeners?.forEach((listener) => listener(event));
  }
}

export const wsClient = new WsClient();
