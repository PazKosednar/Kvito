import { EventEmitter } from "node:events";

/**
 * In-process domain events. Realtime (Socket.IO) and notifications subscribe here,
 * so route handlers do not need to know who listens.
 */
export interface DomainEvents {
  "message.created": { tenancyId: string; messageId: string };
  "conversation.read": { tenancyId: string; userId: string; lastReadAt: string };
  "tenancy.changed": { tenancyId: string; what: "charges" | "issues" | "members" | "documents" | "handover" | "meters" };
}

class TypedBus {
  private emitter = new EventEmitter();
  constructor() {
    this.emitter.setMaxListeners(50);
  }
  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]): void {
    // Listeners must never break the request that triggered the event.
    try {
      this.emitter.emit(event, payload);
    } catch {
      /* ignore listener errors */
    }
  }
  on<K extends keyof DomainEvents>(event: K, listener: (payload: DomainEvents[K]) => void): () => void {
    this.emitter.on(event, listener);
    return () => this.emitter.off(event, listener);
  }
}

export const bus = new TypedBus();
