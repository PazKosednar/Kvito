import type { Plan } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

const GB = 1024 ** 3;

/** Packages from docs/NAROCNINA.md. Prices are shown in the app; Polar charges them. */
export const PLANS: Record<Plan, { units: number; storageBytes: number; monthlyCents: number; yearlyCents: number }> = {
  FREE: { units: 1, storageBytes: 1 * GB, monthlyCents: 0, yearlyCents: 0 },
  PLUS: { units: 3, storageBytes: 5 * GB, monthlyCents: 499, yearlyCents: 4990 },
  PRO: { units: 10, storageBytes: 20 * GB, monthlyCents: 1199, yearlyCents: 11990 },
  MANAGER: { units: 30, storageBytes: 50 * GB, monthlyCents: 2799, yearlyCents: 27990 },
};

/**
 * The landlord's plan; no subscription means FREE. So does a cancelled one past its period, and Kvito's own
 * free trial (TRIALING without a provider subscription) past `trialEndsAt`. A trial at Polar ends at Polar.
 */
export async function planOf(userId: string, now = new Date()): Promise<{ plan: Plan; founder: boolean; trialEndsAt: Date | null; currentPeriodEnd: Date | null; status: string }> {
  const s = await prisma.subscription.findUnique({ where: { userId } });
  if (!s) return { plan: "FREE", founder: false, trialEndsAt: null, currentPeriodEnd: null, status: "ACTIVE" };
  const cancelled = s.status === "CANCELED" && (!s.currentPeriodEnd || s.currentPeriodEnd < now);
  const ownTrial = s.status === "TRIALING" && !s.providerSubscriptionId;
  const trialOver = ownTrial && (!s.trialEndsAt || s.trialEndsAt < now);
  return {
    plan: cancelled || trialOver ? "FREE" : s.plan,
    founder: s.founder,
    trialEndsAt: ownTrial && !trialOver ? s.trialEndsAt : null,
    currentPeriodEnd: s.currentPeriodEnd,
    status: trialOver ? "ACTIVE" : s.status,
  };
}

/** Units of the landlord, oldest first (the newest ones are the ones over a limit). */
const ownedUnits = (ownerId: string) =>
  prisma.unit.findMany({ where: { deletedAt: null, property: { ownerId, deletedAt: null } }, orderBy: { createdAt: "asc" }, select: { id: true } });

/** Bytes of all files of the landlord and of their tenancies (tenants' uploads count to the landlord). */
export async function storageUsed(ownerId: string): Promise<number> {
  const sum = await prisma.attachment.aggregate({
    _sum: { sizeBytes: true },
    where: { deletedAt: null, OR: [{ uploadedById: ownerId }, { tenancy: { unit: { property: { ownerId } } } }] },
  });
  return sum._sum.sizeBytes ?? 0;
}

export async function usageOf(ownerId: string) {
  const [units, storageBytes] = await Promise.all([ownedUnits(ownerId), storageUsed(ownerId)]);
  return { units: units.length, storageBytes };
}

/** No new unit when the plan's units are used up. */
export async function assertCanAddUnit(ownerId: string): Promise<void> {
  const [{ plan }, units] = await Promise.all([planOf(ownerId), ownedUnits(ownerId)]);
  if (units.length >= PLANS[plan].units) throw new AppError(403, "PLAN_LIMIT_UNITS");
}

/**
 * Units over the limit (the newest) are read-only: no new tenancies or obligations until the landlord upgrades
 * or removes units. Tenants keep seeing their history and the payment data of existing obligations.
 */
export async function assertUnitWritable(ownerId: string, unitId: string): Promise<void> {
  const [{ plan }, units] = await Promise.all([planOf(ownerId), ownedUnits(ownerId)]);
  const index = units.findIndex((u) => u.id === unitId);
  if (index >= PLANS[plan].units) throw new AppError(403, "PLAN_LIMIT_UNIT_LOCKED");
}

/** A new file must fit into the plan's storage. */
export async function assertStorageFor(ownerId: string, bytes: number): Promise<void> {
  const [{ plan }, used] = await Promise.all([planOf(ownerId), storageUsed(ownerId)]);
  if (used + bytes > PLANS[plan].storageBytes) throw new AppError(403, "PLAN_LIMIT_STORAGE");
}
