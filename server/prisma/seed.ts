/**
 * Development seed. Idempotent: safe to run repeatedly (`npm run db:seed`).
 * 1 landlord, 1 property with 2 units, 3 tenants (unit A: 1 tenant, unit B: 2 flatmates),
 * charges in every status.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type ChargeStatus, type Prisma } from "../src/generated/prisma/client.js";
import { hashPassword } from "../src/lib/password.js";

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

/** Development password of every seed user (see README). A password changed in the app is kept. */
const SEED_PASSWORD = "kvito1234";
let seedHash: Promise<string> | null = null;

async function upsertUser(email: string, name: string, roles: ("LANDLORD" | "TENANT")[]) {
  const passwordHash = await (seedHash ??= hashPassword(SEED_PASSWORD));
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, roles, lastActiveRole: roles[0] ?? null },
    create: { email, name, roles, lastActiveRole: roles[0] ?? null, passwordHash, emailVerifiedAt: new Date() },
  });
  if (!user.passwordHash || !user.emailVerifiedAt) {
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: user.passwordHash ?? passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? new Date() } });
  }
  return user;
}

async function main() {
  const landlord = await upsertUser("najemodajalec@kvita.test", "Mojca Novak", ["LANDLORD"]);
  const ana = await upsertUser("ana@kvita.test", "Ana Kovač", ["TENANT"]);
  const luka = await upsertUser("luka@kvita.test", "Luka Horvat", ["TENANT"]);
  const nina = await upsertUser("nina@kvita.test", "Nina Zupan", ["TENANT"]);
  // Two units need PLUS (plan limits always apply); managed by hand, not by Polar.
  await prisma.subscription.upsert({ where: { userId: landlord.id }, update: { plan: "PLUS", status: "ACTIVE", trialEndsAt: null }, create: { userId: landlord.id, plan: "PLUS", status: "ACTIVE" } });

  await prisma.property.upsert({
    where: { id: ID.property },
    update: {},
    create: {
      id: ID.property,
      ownerId: landlord.id,
      type: "HOUSE",
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

  const gaja = await seedPavsal(landlord.id, tenancyBase);

  console.log(`Seed končan. Prijava z geslom ${SEED_PASSWORD}:`);
  for (const u of [landlord, ana, luka, nina, gaja]) console.log(`  ${u.email}  (${u.roles.join(", ")})`);
}

/**
 * Tenancy C – pavšal: 400 € rent + 110 € for costs in one monthly payment, costs entered month by month,
 * a settlement for Feb–Oct sent to the tenant with 223,71 € in her favour (numbers from a real spreadsheet).
 */
async function seedPavsal(landlordId: string, base: { status: "ACTIVE"; rentDueDay: number; payeeName: string; payeeIban: string; payeeStreet: string; payeeCity: string }) {
  const gaja = await upsertUser("gaja@kvita.test", "Gaja Kuhar", ["TENANT"]);
  const unitId = "seed-unit-c";
  const tenancyId = "seed-tenancy-c";
  await prisma.unit.upsert({ where: { id: unitId }, update: {}, create: { id: unitId, propertyId: ID.property, name: "Stanovanje C", floor: "2. nadstropje" } });
  await prisma.tenancy.upsert({
    where: { id: tenancyId },
    update: {},
    create: { ...base, id: tenancyId, unitId, startDate: utcDate(2026, 2, 1), rentCents: 40000, depositCents: 80000, billingMode: "COMBINED", splitMethod: "EQUAL" },
  });
  const member = await upsertMember(tenancyId, gaja.id, { isPrimary: true });
  if (!(await prisma.costAdvance.count({ where: { tenancyId, deletedAt: null } }))) {
    await prisma.costAdvance.create({ data: { tenancyId, costType: "OTHER", amountCents: 11000 } });
  }

  const months: [string, number, number, number][] = [
    ["2026-02", 4441, 4333, 1402],
    ["2026-03", 4056, 3632, 1402],
    ["2026-04", 4353, 2450, 1402],
    ["2026-05", 5741, 2960, 1402],
    ["2026-06", 4808, 1720, 1402],
    ["2026-07", 4395, 1845, 1402],
    ["2026-08", 4600, 1551, 1402],
    ["2026-09", 4755, 870, 1402],
    ["2026-10", 4800, 2701, 1402],
  ];
  for (const [period] of [...months, ["2026-11"] as const]) {
    const [y, m] = period.split("-").map(Number) as [number, number];
    const paid = period !== "2026-11";
    await upsertCharge(
      {
        id: `seed-charge-c-${period}`,
        tenancyId,
        type: "RENT",
        costType: "RENT",
        title: `Najemnina in stroški ${period}`,
        amountCents: 51000,
        dueDate: utcDate(y, m, 5),
        rentPeriod: period,
        autoKey: `combined:${period}`,
        purposeCode: "RENT",
        status: paid ? "CONFIRMED" : "OPEN",
        lines: { create: [{ costType: "RENT", amountCents: 40000, sortOrder: 0 }, { costType: "OTHER", amountCents: 11000, sortOrder: 1 }] },
      },
      [{ memberId: member.id, amountCents: 51000, status: paid ? "CONFIRMED" : "OPEN", ...(paid ? { confirmedById: landlordId } : {}) }],
    );
  }
  for (const [period, mgmt, elec, tv] of months) {
    for (const [costType, amountCents] of [["BUILDING_MANAGEMENT", mgmt], ["ELECTRICITY", elec], ["TV", tv]] as const) {
      const exists = await prisma.costEntry.findFirst({ where: { tenancyId, period, costType, deletedAt: null } });
      if (!exists) await prisma.costEntry.create({ data: { tenancyId, period, costType, amountCents, createdById: landlordId, note: costType === "BUILDING_MANAGEMENT" ? "Upravnik" : null } });
    }
  }
  await prisma.costSettlement.upsert({
    where: { id: "seed-settlement-c-2026" },
    update: {},
    create: {
      id: "seed-settlement-c-2026",
      tenancyId,
      periodFrom: utcDate(2026, 2, 1),
      periodTo: utcDate(2026, 10, 31),
      status: "SENT",
      sentAt: utcDate(2026, 11, 14),
      recommendedChoice: "CARRY_OVER",
      note: "Običajno pustimo znesek v dobro – vmes je zimska sezona in ogrevanje bo dražje. Odločitev prepuščam tebi.",
      createdById: landlordId,
      lines: {
        create: [
          { costType: "ELECTRICITY", advanceCents: 0, actualCents: 22062, sortOrder: 0 },
          { costType: "TV", advanceCents: 0, actualCents: 12618, sortOrder: 1, note: "RTV prispevek" },
          { costType: "BUILDING_MANAGEMENT", advanceCents: 0, actualCents: 41949, sortOrder: 2, note: "Upravnik" },
          { costType: "OTHER", advanceCents: 99000, actualCents: 0, sortOrder: 3 },
        ],
      },
    },
  });
  return gaja;
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
