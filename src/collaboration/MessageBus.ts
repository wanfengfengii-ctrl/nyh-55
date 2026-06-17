import type { CollabMessage, CollabMessageType } from '@/types';
import { generateId, getBroadcastChannelName } from './utils';

type MessageHandler = (message: CollabMessage) => void;

export class MessageBus {
  private sessionId: string;
  private channel: BroadcastChannel | null = null;
  private handlers: Map<CollabMessageType, Set<MessageHandler>> = new Map();
  private globalHandlers: Set<MessageHandler> = new Set();
  private selfId: string;
  private connected = false;

  constructor(sessionId: string, selfId: string) {
    this.sessionId = sessionId;
    this.selfId = selfId;
  }

  connect(): void {
    if (this.connected) return;
    try {
      this.channel = new BroadcastChannel(getBroadcastChannelName(this.sessionId));
      this.channel.onmessage = (event) => {
        const message = event.data as CollabMessage;
        if (!message || message.sessionId !== this.sessionId) return;
        this.dispatch(message);
      };
      this.connected = true;
    } catch (e) {
      console.warn('BroadcastChannel not available, using local event dispatcher');
      this.connected = true;
    }
  }

  disconnect(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.handlers.clear();
    this.globalHandlers.clear();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  send<T = unknown>(type: CollabMessageType, payload: T, senderName: string): CollabMessage<T> {
    const message: CollabMessage<T> = {
      id: generateId('msg'),
      type,
      sessionId: this.sessionId,
      senderId: this.selfId,
      senderName,
      timestamp: Date.now(),
      payload,
    };

    if (this.channel) {
      try {
        this.channel.postMessage(message);
      } catch (e) {
        console.error('Failed to post message:', e);
      }
    } else {
      setTimeout(() => this.dispatch(message), 0);
    }

    return message;
  }

  on(type: CollabMessageType, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  onAll(handler: MessageHandler): () => void {
    this.globalHandlers.add(handler);
    return () => {
      this.globalHandlers.delete(handler);
    };
  }

  off(type: CollabMessageType, handler: MessageHandler): void {
    this.handlers.get(type)?.delete(handler);
  }

  private dispatch(message: CollabMessage): void {
    if (message.senderId === this.selfId) return;

    for (const handler of this.globalHandlers) {
      try {
        handler(message);
      } catch (e) {
        console.error('Global handler error:', e);
      }
    }

    const typeHandlers = this.handlers.get(message.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        try {
          handler(message);
        } catch (e) {
          console.error(`Handler for ${message.type} error:`, e);
        }
      }
    }
  }
}
