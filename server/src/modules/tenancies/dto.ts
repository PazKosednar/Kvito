import { Prisma } from "../../generated/prisma/client.js";

/** Everything a tenancy screen needs, for both landlord and tenant views. */
export const tenancyInclude = {
  unit: {
    select: {
      id: true,
      name: true,
      floor: true,
      // Unit details both sides see (keys and photos stay with the landlord).
      areaM2: true,
      layout: true,
      furnishing: true,
      hasParking: true,
      hasStorage: true,
      hasBalcony: true,
      petsAllowed: true,
      energyClass: true,
      utilityPoints: { orderBy: { createdAt: "asc" }, select: { id: true, kind: true, pointNumber: true, supplier: true, note: true } },
      property: {
        select: {
          id: true,
          type: true,
          name: true,
          street: true,
          postalCode: true,
          city: true,
          owner: { select: { id: true, name: true, email: true, phone: true } },
        },
      },
    },
  },
  members: {
    where: { deletedAt: null, leftAt: null },
    orderBy: [{ isPrimary: "desc" }, { joinedAt: "asc" }],
    include: { user: { select: { id: true, name: true, email: true } } },
  },
} satisfies Prisma.TenancyInclude;

export type TenancyWithRelations = Prisma.TenancyGetPayload<{ include: typeof tenancyInclude }>;
