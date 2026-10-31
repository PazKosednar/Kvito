/**
 * Development seed. Idempotent: safe to run repeatedly (`npm run db:seed`).
 * 1 landlord, 1 property with 2 units, 3 tenants (unit A: 1 tenant, unit B: 2 flatmates),
 * charges in every status.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type ChargeStatus, type Prisma } from "../src/generated/prisma/client.js";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) throw new Error("DATABASE_URL is not set (server/.env)");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Fixed ids keep the seed idempotent and make dev URLs stable.
const ID = {
  property: "seed-property-1",
  unitA: "seed-unit-a",
  unitB: "seed-unit-b",
  tenancyA: "seed-tenancy-a",
  tenancyB: "seed-tenancy-b",
} as const;

// Fictional, checksum-valid IBAN for development only. TODO(preveri): replace with a bank-provided test IBAN before UPN QR testing.
const DEV_IBAN = "SI56191000000123438";

const utcDate = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

async function upsertUser(email: string, name: string, roles: ("LANDLORD" | "TENANT")[]) {
  return prisma.user.upsert({
    where: { email },
    update: { name, roles, lastActiveRole: roles[0] ?? null },
    create: { email, name, roles, lastActiveRole: roles[0] ?? null },
  });
}

async function main() {
  const landlord = await upsertUser("najemodajalec@kvita.test", "Mojca Novak", ["LANDLORD"]);
  const ana = await upsertUser("ana@kvita.test", "Ana Kovač", ["TENANT"]);
  const luka = await upsertUser("luka@kvita.test", "Luka Horvat", ["TENANT"]);
  const nina = await upsertUser("nina@kvita.test", "Nina Zupan", ["TENANT"]);

  await prisma.property.upsert({
    where: { id: ID.property },
    update: {},
    create: {
      id: ID.property,
      ownerId: landlord.id,
      name: "Hiša na Trnovem",
      street: "Trnovska ulica 1",
      postalCode: "1000",
      city: "Ljubljana",
    },
  });

  for (const [id, name, floor] of [
    [ID.unitA, "Stanovanje A", "pritličje"],
    [ID.unitB, "Stanovanje B", "1. nadstropje"],
  ] as const) {
    await prisma.unit.upsert({ where: { id }, update: {}, create: { id, propertyId: ID.property, name, floor } });
  }

  const tenancyBase = {
    status: "ACTIVE" as const,
    startDate: utcDate(2026, 1, 1),
    rentDueDay: 5,
    payeeName: landlord.name ?? "Najemodajalec",
    payeeIban: DEV_IBAN,
    payeeStreet: "Trnovska ulica 1",
    payeeCity: "1000 Ljubljana",
  };

  await prisma.tenancy.upsert({
    where: { id: ID.tenancyA },
    update: {},
    create: {
      ...tenancyBase,
      id: ID.tenancyA,
      unitId: ID.unitA,
      rentCents: 65000,
      depositCents: 130000,
      coveredCosts: ["ELECTRICITY", "WATER", "INTERNET"],
      splitMethod: "EQUAL",
    },
  });
  await prisma.tenancy.upsert({
    where: { id: ID.tenancyB },
    update: {},
    create: {
      ...tenancyBase,
      id: ID.tenancyB,
      unitId: ID.unitB,
      rentCents: 90000,
      depositCents: 180000,
      coveredCosts: ["ELECTRICITY", "HEATING", "WATER", "WASTE"],
      splitMethod: "PERCENTAGE",
    },
  });

  const memberAna = await upsertMember(ID.tenancyA, ana.id, { isPrimary: true });
  const memberLuka = await upsertMember(ID.tenancyB, luka.id, { isPrimary: true, shareBasisPoints: 6000 });
  const memberNina = await upsertMember(ID.tenancyB, nina.id, { shareBasisPoints: 4000 });

  const rentA = (period: string, due: Date, status: ChargeStatus) => ({
    id: `seed-charge-a-rent-${period}`,
    tenancyId: ID.tenancyA,
    type: "RENT" as const,
    costType: "RENT" as const,
    title: `Najemnina ${period}`,
    amountCents: 65000,
    dueDate: due,
    rentPeriod: period,
    status,
  });

  // Tenancy A – single tenant: every status represented.
  await upsertCharge(rentA("2026-08", utcDate(2026, 8, 5), "CONFIRMED"), [
    { memberId: memberAna.id, amountCents: 65000, status: "CONFIRMED", confirmedById: landlord.id },
  ]);
  await upsertCharge(rentA("2026-09", utcDate(2026, 9, 5), "OVERDUE"), [
    { memberId: memberAna.id, amountCents: 65000, status: "OVERDUE" },
  ]);
  await upsertCharge(rentA("2026-10", utcDate(2026, 10, 5), "REPORTED_PAID"), [
    { memberId: memberAna.id, amountCents: 65000, status: "REPORTED_PAID", reportedById: ana.id },
  ]);
  await upsertCharge(rentA("2026-11", utcDate(2026, 11, 5), "OPEN"), [
    { memberId: memberAna.id, amountCents: 65000, status: "OPEN" },
  ]);
  await upsertCharge(
    {
      id: "seed-charge-a-electricity-2026-09",
      tenancyId: ID.tenancyA,
      type: "BILL",
      costType: "ELECTRICITY",
      title: "Elektrika september",
      amountCents: 4873,
      dueDate: utcDate(2026, 10, 18),
      status: "DISPUTED",
      payTo: "SUPPLIER",
      payeeName: "Dobavitelj elektrike d.o.o.",
      description: "Znesek je višji kot običajno – preveriva odčitek.",
    },
    [{ memberId: memberAna.id, amountCents: 4873, status: "DISPUTED" }],
  );

  // Tenancy B – two flatmates with a 60/40 split.
  await upsertCharge(
    {
      id: "seed-charge-b-rent-2026-10",
      tenancyId: ID.tenancyB,
      type: "RENT",
      costType: "RENT",
      title: "Najemnina 2026-10",
      amountCents: 90000,
      dueDate: utcDate(2026, 10, 5),
      rentPeriod: "2026-10",
      status: "CONFIRMED",
    },
    [
      { memberId: memberLuka.id, amountCents: 54000, status: "CONFIRMED", confirmedById: landlord.id },
      { memberId: memberNina.id, amountCents: 36000, status: "CONFIRMED", confirmedById: landlord.id },
    ],
  );
  await upsertCharge(
    {
      id: "seed-charge-b-heating-2026-10",
      tenancyId: ID.tenancyB,
      type: "BILL",
      costType: "HEATING",
      title: "Ogrevanje oktober",
      amountCents: 12550,
      dueDate: utcDate(2026, 11, 15),
      status: "OPEN",
    },
    [
      // Rounding remainder goes to the primary member (final split rules in Phase 2).
      { memberId: memberLuka.id, amountCents: 7530, status: "REPORTED_PAID", reportedById: luka.id },
      { memberId: memberNina.id, amountCents: 5020, status: "OPEN" },
    ],
  );

  console.log("Seed končan. Prijava (koda se izpiše v konzolo strežnika):");
  for (const u of [landlord, ana, luka, nina]) console.log(`  ${u.email}  (${u.roles.join(", ")})`);
}

async function upsertMember(
  tenancyId: string,
  userId: string,
  extra: { isPrimary?: boolean; shareBasisPoints?: number },
) {
  return prisma.tenancyMember.upsert({
    where: { tenancyId_userId: { tenancyId, userId } },
    update: {},
    create: { tenancyId, userId, joinedAt: utcDate(2026, 1, 1), ...extra },
  });
}

interface SeedShare {
  memberId: string;
  amountCents: number;
  status: ChargeStatus;
  confirmedById?: string;
  reportedById?: string;
}

async function upsertCharge(
  charge: Omit<Prisma.ChargeUncheckedCreateInput, "payeeName" | "payeeIban"> &
    Partial<Pick<Prisma.ChargeUncheckedCreateInput, "payeeName" | "payeeIban">> & { id: string },
  shares: SeedShare[],
) {
  const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: charge.tenancyId } });
  await prisma.charge.upsert({
    where: { id: charge.id },
    update: {},
    create: {
      payeeName: tenancy.payeeName,
      payeeIban: tenancy.payeeIban,
      payeeStreet: tenancy.payeeStreet,
      payeeCity: tenancy.payeeCity,
      ...charge,
    },
  });

  for (const s of shares) {
    const share = await prisma.chargeShare.upsert({
      where: { chargeId_memberId: { chargeId: charge.id, memberId: s.memberId } },
      update: {},
      create: {
        chargeId: charge.id,
        memberId: s.memberId,
        amountCents: s.amountCents,
        status: s.status,
        ...(s.confirmedById ? { confirmedById: s.confirmedById, confirmedAt: new Date() } : {}),
      },
    });

    const reporter = s.reportedById ?? (s.status === "CONFIRMED" ? await memberUserId(s.memberId) : undefined);
    if (reporter) {
      const existing = await prisma.paymentReport.findFirst({ where: { chargeShareId: share.id } });
      if (!existing) {
        await prisma.paymentReport.create({
          data: {
            chargeShareId: share.id,
            reportedById: reporter,
            amountCents: s.amountCents,
            paidOn: charge.dueDate instanceof Date ? charge.dueDate : new Date(charge.dueDate),
            status: s.status === "CONFIRMED" ? "ACCEPTED" : "PENDING",
            ...(s.status === "CONFIRMED" ? { reviewedById: s.confirmedById ?? null, reviewedAt: new Date() } : {}),
          },
        });
      }
    }
  }
}

async function memberUserId(memberId: string): Promise<string> {
  const m = await prisma.tenancyMember.findUniqueOrThrow({ where: { id: memberId } });
  return m.userId;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err: unknown) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
