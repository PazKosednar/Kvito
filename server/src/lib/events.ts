import { EventEmitter } from "node:events";
import type { ChargeTitleSource } from "../i18n/format.js";

/** Deposit, cost settlement and rent events – each becomes a notification for the other side. */
export type ContractActivity =
  | { kind: "deposit.proposed"; returnCents: number; keptCents: number }
  | { kind: "deposit.agreed" | "deposit.disputed" | "deposit.receipt" }
  | { kind: "deposit.returned"; returnCents: number; returnedOn: Date }
  | { kind: "settlement.sent"; settlementId: string; periodFrom: Date; periodTo: Date; balanceCents: number }
  | { kind: "settlement.accepted" | "settlement.disputed" | "settlement.refundReceipt"; settlementId: string }
  | { kind: "settlement.refunded"; settlementId: string; refundCents: number; refundedOn: Date }
  | { kind: "rent.scheduled"; rentCents: number; effectiveFrom: Date };

/**
 * In-process domain events. Realtime (Socket.IO) and notifications subscribe here,
 * so route handlers do not need to know who listens.
 */
export interface DomainEvents {
  "message.created": { tenancyId: string; messageId: string };
  "conversation.read": { tenancyId: string; userId: string; lastReadAt: string };
  "charge.activity": {
    tenancyId: string;
    chargeId: string;
    kind: "created" | "reported" | "confirmed" | "rejected" | "disputed";
    /** Who did it (null: the system, e.g. automatic monthly rent). */
    actorId: string | null;
    /** Enough to show the title in the reader's language. */
    charge: ChargeTitleSource;
    amountCents: number;
    /** User the share belongs to (for reported/confirmed/rejected/disputed). */
    shareUserId?: string;
  };
  "contract.activity": { tenancyId: string; actorId: string } & ContractActivity;
  "tenancy.changed": { tenancyId: string; what: "charges" | "issues" | "members" | "documents" | "handover" | "meters" | "contract" };
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
