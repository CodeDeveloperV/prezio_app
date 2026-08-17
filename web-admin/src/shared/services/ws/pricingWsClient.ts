import { WS_BASE_URL } from '../api/config';

import type { Availability, PriceUpdateSource } from '@prezio/shared-types';

// Actual wire shape published by the backend's `_publish_price_update` (see
// backend/app/features/pricing/service.py) -- no "type" discriminator field.
export interface PricingWsEvent {
  store_product_id: number;
  price: string;
  version: number;
  availability: Availability;
  source: PriceUpdateSource;
}

type Listener = (event: PricingWsEvent) => void;

interface SubscribeMessage {
  action: 'subscribe' | 'unsubscribe';
  store_product_id: number;
}

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

/**
 * Lazily-connecting client for `/pricing/ws`: opens the socket on the first
 * subscribe() call, closes it once the last topic unsubscribes, and
 * auto-reconnects (with backoff) while any topic remains subscribed.
 */
class PricingWsClient {
  private socket: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly topicListeners = new Map<number, Set<Listener>>();

  subscribe(storeProductId: number, listener: Listener): () => void {
    let listeners = this.topicListeners.get(storeProductId);
    if (!listeners) {
      listeners = new Set();
      this.topicListeners.set(storeProductId, listeners);
      this.ensureConnected();
      this.send({ action: 'subscribe', store_product_id: storeProductId });
    }
    listeners.add(listener);

    return () => {
      listeners?.delete(listener);
      if (listeners && listeners.size === 0) {
        this.topicListeners.delete(storeProductId);
        this.send({ action: 'unsubscribe', store_product_id: storeProductId });
        if (this.topicListeners.size === 0) {
          this.disconnect();
        }
      }
    };
  }

  private ensureConnected() {
    if (this.socket || this.reconnectTimer) return;
    this.openSocket();
  }

  private disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
    this.socket?.close();
    this.socket = null;
  }

  private openSocket() {
    const socket = new WebSocket(WS_BASE_URL);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      for (const storeProductId of this.topicListeners.keys()) {
        this.send({ action: 'subscribe', store_product_id: storeProductId });
      }
    };

    socket.onmessage = (event) => {
      this.handleMessage(event.data as string);
    };

    socket.onclose = () => {
      this.socket = null;
      if (this.topicListeners.size > 0) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect() {
    const delay = Math.min(BASE_BACKOFF_MS * 2 ** this.reconnectAttempt, MAX_BACKOFF_MS);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private send(message: SubscribeMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
    // If not open yet, onopen will re-subscribe to everything in topicListeners.
  }

  private handleMessage(raw: string) {
    let event: PricingWsEvent;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }

    const listeners = this.topicListeners.get(event.store_product_id);
    listeners?.forEach((listener) => listener(event));
  }
}

export const pricingWsClient = new PricingWsClient();
