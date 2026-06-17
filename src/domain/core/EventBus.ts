import type {
  IEventBus,
  DomainEvent,
  EventHandler,
  EventSubscription,
  DomainModuleId,
} from './types';
import { createEventId } from './types';

type HandlerRegistry = Map<string, Set<EventHandler<unknown>>>;

export class EventBus implements IEventBus {
  private handlers: HandlerRegistry = new Map();
  private wildcardHandlers: Set<EventHandler<unknown>> = new Set();
  private module: DomainModuleId;

  constructor(module: DomainModuleId = 'mechanical') {
    this.module = module;
  }

  setModule(module: DomainModuleId): void {
    this.module = module;
  }

  publish<T>(event: Omit<DomainEvent<T>, 'id' | 'timestamp'>): DomainEvent<T> {
    const fullEvent: DomainEvent<T> = {
      ...event,
      id: createEventId(),
      timestamp: Date.now(),
      source: event.source || this.module,
    } as DomainEvent<T>;

    this.wildcardHandlers.forEach((handler) => {
      try {
        handler(fullEvent as DomainEvent<unknown>);
      } catch (e) {
        console.error('[EventBus] Wildcard handler error:', e);
      }
    });

    const typeHandlers = this.handlers.get(fullEvent.type);
    if (typeHandlers) {
      typeHandlers.forEach((handler) => {
        try {
          handler(fullEvent as DomainEvent<unknown>);
        } catch (e) {
          console.error(`[EventBus] Handler error for type=${fullEvent.type}:`, e);
        }
      });
    }

    return fullEvent;
  }

  subscribe<T>(type: string, handler: EventHandler<T>): EventSubscription {
    if (type === '*') {
      this.wildcardHandlers.add(handler as EventHandler<unknown>);
      return () => {
        this.wildcardHandlers.delete(handler as EventHandler<unknown>);
      };
    }

    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler as EventHandler<unknown>);

    return () => {
      const set = this.handlers.get(type);
      if (set) {
        set.delete(handler as EventHandler<unknown>);
        if (set.size === 0) {
          this.handlers.delete(type);
        }
      }
    };
  }

  unsubscribe(type: string, handler: EventHandler): void {
    if (type === '*') {
      this.wildcardHandlers.delete(handler as EventHandler<unknown>);
      return;
    }
    const set = this.handlers.get(type);
    if (set) {
      set.delete(handler as EventHandler<unknown>);
      if (set.size === 0) {
        this.handlers.delete(type);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
    this.wildcardHandlers.clear();
  }
}

export const globalEventBus = new EventBus('mechanical');
