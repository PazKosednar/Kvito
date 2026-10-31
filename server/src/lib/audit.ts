import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { prisma } from "./prisma.js";

type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditEntry {
  actorId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  ip?: string | undefined;
}

const toJson = (v: unknown): Prisma.InputJsonValue | undefined =>
  v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);

/** Append-only audit trail: who changed what, when, before/after. Pass a transaction client to keep it atomic. */
export async function audit(entry: AuditEntry, db: Db = prisma): Promise<void> {
  const before = toJson(entry.before);
  const after = toJson(entry.after);
  await db.auditLog.create({
    data: {
      actorId: entry.actorId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      ...(before !== undefined ? { before } : {}),
      ...(after !== undefined ? { after } : {}),
      ip: entry.ip ?? null,
    },
  });
}

/** Only the keys whose values differ – keeps audit rows small and readable. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    const prev = before[key] instanceof Date ? (before[key] as Date).toISOString() : before[key];
    const next = after[key] instanceof Date ? (after[key] as Date).toISOString() : after[key];
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      b[key] = before[key];
      a[key] = after[key] as T[keyof T];
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}
