import { notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

/**
 * Server-side ownership checks used by every resource route (Phase 1+).
 * They answer 404 instead of 403 so that the existence of other people's data does not leak.
 */

export async function assertPropertyOwner(userId: string, propertyId: string): Promise<void> {
  const found = await prisma.property.findFirst({
    where: { id: propertyId, ownerId: userId, deletedAt: null },
    select: { id: true },
  });
  if (!found) throw notFound();
}

export type TenancyAccess = "LANDLORD" | "TENANT";

/** Landlord of the tenancy's property, or an active member of the tenancy. */
export async function assertTenancyAccess(userId: string, tenancyId: string): Promise<TenancyAccess> {
  const tenancy = await prisma.tenancy.findFirst({
    where: { id: tenancyId, deletedAt: null },
    select: {
      unit: { select: { property: { select: { ownerId: true } } } },
      members: { where: { userId, deletedAt: null, leftAt: null }, select: { id: true } },
    },
  });
  if (!tenancy) throw notFound();
  if (tenancy.unit.property.ownerId === userId) return "LANDLORD";
  if (tenancy.members.length > 0) return "TENANT";
  throw notFound();
}
