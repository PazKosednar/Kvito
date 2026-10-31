import { Prisma } from "../../generated/prisma/client.js";

/** Everything a tenancy screen needs, for both landlord and tenant views. */
export const tenancyInclude = {
  unit: {
    select: {
      id: true,
      name: true,
      floor: true,
      property: {
        select: {
          id: true,
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
