import { notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

/**
 * Server-side ownership checks used by every resource route.
 * They answer 404 instead of 403 so that the existence of other people's data does not leak.
 */

export async function assertPropertyOwner(userId: string, propertyId: string): Promise<void> {
  const found = await prisma.property.findFirst({
    where: { id: propertyId, ownerId: userId, deletedAt: null },
    select: { id: true },
  });
  if (!found) throw notFound();
}

export async function assertUnitOwner(userId: string, unitId: string): Promise<void> {
  const found = await prisma.unit.findFirst({
    where: { id: unitId, deletedAt: null, property: { ownerId: userId, deletedAt: null } },
    select: { id: true },
  });
  if (!found) throw notFound();
}

export type TenancyAccess = "LANDLORD" | "TENANT";

export interface TenancyAccessResult {
  role: TenancyAccess;
  /** The caller's membership when they are a tenant. */
  memberId: string | null;
  landlordId: string;
}

/** Landlord of the tenancy's property, or an active member of the tenancy. */
export async function assertTenancyAccess(userId: string, tenancyId: string): Promise<TenancyAccessResult> {
  const tenancy = await prisma.tenancy.findFirst({
    where: { id: tenancyId, deletedAt: null, unit: { deletedAt: null, property: { deletedAt: null } } },
    select: {
      unit: { select: { property: { select: { ownerId: true } } } },
      members: { where: { userId, deletedAt: null, leftAt: null }, select: { id: true } },
    },
  });
  if (!tenancy) throw notFound();
  const landlordId = tenancy.unit.property.ownerId;
  if (landlordId === userId) return { role: "LANDLORD", memberId: null, landlordId };
  const member = tenancy.members[0];
  if (member) return { role: "TENANT", memberId: member.id, landlordId };
  throw notFound();
}

export async function assertTenancyLandlord(userId: string, tenancyId: string): Promise<TenancyAccessResult> {
  const access = await assertTenancyAccess(userId, tenancyId);
  if (access.role !== "LANDLORD") throw notFound();
  return access;
}
