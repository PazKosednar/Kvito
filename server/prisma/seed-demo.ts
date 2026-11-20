/**
 * Demo seed: one landlord with 3 properties (4 units, 5 tenancies) and about two years of history,
 * ending in the current month. Meant for trying the app and for screenshots, not for tests.
 *
 *   npm run db:seed:demo            creates the data (skips if it already exists)
 *   npm run db:seed:demo -- --reset deletes ONLY this demo landlord's properties and everything under them, then recreates
 *
 * All dates are relative to today (Europe/Ljubljana): the history always ends in the current month, so a
 * --reset later moves the data forward. Amounts are fictional; nothing here is a legal or tax rule.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type ChargeStatus, type CostType, type Prisma } from "../src/generated/prisma/client.js";
import { addDays, dueDateInMonth, todayInLjubljana } from "../src/lib/dates.js";
import { hashPassword } from "../src/lib/password.js";
import { PURPOSE_CODE_BY_COST } from "../src/lib/purpose-codes.js";
import { splitAmount } from "../src/lib/split.js";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) throw new Error("DATABASE_URL is not set (server/.env)");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const PASSWORD = "kvito1234";
const LANDLORD_EMAIL = "demo@kvito.test";
// Fictional, checksum-valid IBANs (development only).
const LANDLORD_IBAN = "SI56191000000123438";
const SUPPLIER_IBAN = "SI89051008010000777";
const MONTHS = 24;
const MONTHS_SL = ["januar", "februar", "marec", "april", "maj", "junij", "julij", "avgust", "september", "oktober", "november", "december"];

// ---------- Time helpers (everything relative to today) ----------

const NOW = new Date();
const TODAY = todayInLjubljana(NOW);
const CUR_Y = TODAY.getUTCFullYear();
const CUR_M = TODAY.getUTCMonth() + 1;

/** Month index 0 = 23 months ago, MONTHS - 1 = current month. */
function ym(i: number): { y: number; m: number; period: string } {
  const total = CUR_Y * 12 + (CUR_M - 1) - (MONTHS - 1) + i;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return { y, m, period: `${y}-${String(m).padStart(2, "0")}` };
}
const day = (i: number, d: number) => {
  const { y, m } = ym(i);
  return dueDateInMonth(y, m, d);
};
/** A timestamp on month i, day d, at the given Ljubljana-ish hour (stored UTC). Never in the future. */
const at = (i: number, d: number, hour = 9, min = 0) => past(new Date(day(i, d).getTime() + (hour - 1) * 3_600_000 + min * 60_000));
const past = (d: Date) => (d > NOW ? new Date(NOW.getTime() - 60_000) : d);
const monthEnd = (i: number) => {
  const { y, m } = ym(i);
  return new Date(Date.UTC(y, m, 0));
};
const monthName = (i: number) => `${MONTHS_SL[ym(i).m - 1]} ${ym(i).y}`;
/** Index of the first January at or after month index `from`. */
const firstJanuaryFrom = (from: number) => {
  for (let i = from; i < MONTHS; i++) if (ym(i).m === 1) return i;
  return null;
};

// Deterministic "random" so every run produces the same history.
let seed = 20261120;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a: number, b: number) => Math.round(a + rand() * (b - a));
const winter = (i: number) => [11, 12, 1, 2, 3].includes(ym(i).m);
const shoulder = (i: number) => [4, 10].includes(ym(i).m);

// ---------- Users ----------

let passwordHash: Promise<string> | null = null;
async function upsertUser(email: string, name: string, roles: ("LANDLORD" | "TENANT")[], phone?: string) {
  const hash = await (passwordHash ??= hashPassword(PASSWORD));
  return prisma.user.upsert({
    where: { email },
    update: { name, roles, lastActiveRole: roles[0] ?? null },
    create: { email, name, phone: phone ?? null, roles, lastActiveRole: roles[0] ?? null, passwordHash: hash, emailVerifiedAt: at(0, 1, 8), createdAt: at(0, 1, 8) },
  });
}

// ---------- Scenario ----------

type Member = { id: string; userId: string; isPrimary: boolean; shareBasisPoints: number | null; personCount: number };
interface TenancyCtx {
  id: string;
  unitId: string;
  startIdx: number;
  endIdx: number | null;
  rentDueDay: number;
  splitMethod: "EQUAL" | "PERCENTAGE" | "PER_PERSON";
  members: Member[];
  /** Days late a member pays in a month (0 = on time). */
  lateDays: (i: number, memberIdx: number) => number;
  /** Status override for a share due on/before today, e.g. this month's unpaid rent. */
  override?: (i: number, memberIdx: number, type: string) => ChargeStatus | null;
  /** Who records the payment: the tenant ("I paid") or the landlord (from the bank statement). */
  reportedBy: "TENANT" | "LANDLORD";
}

let landlordId = "";

async function main() {
  const reset = process.argv.includes("--reset");
  const landlord = await upsertUser(LANDLORD_EMAIL, "Tomaž Kranjc", ["LANDLORD"], "041 555 210");
  landlordId = landlord.id;

  const existing = await prisma.property.count({ where: { ownerId: landlord.id } });
  if (existing && !reset) {
    console.log(`Demo podatki že obstajajo (${existing} nepremičnine). Za ponovno ustvarjanje: npm run db:seed:demo -- --reset`);
    return printLogins();
  }
  if (existing) await wipe(landlord.id);

  const jure = await upsertUser("jure@kvito.test", "Jure Vidmar", ["TENANT"], "031 482 117");
  const maja = await upsertUser("maja@kvito.test", "Maja Kolar", ["TENANT"], "040 219 334");
  const rok = await upsertUser("rok@kvito.test", "Rok Kolar", ["TENANT"]);
  const tina = await upsertUser("tina@kvito.test", "Tina Bezjak", ["TENANT"], "051 700 845");
  const zan = await upsertUser("zan@kvito.test", "Žan Horvat", ["TENANT"], "068 144 902");
  const petra = await upsertUser("petra@kvito.test", "Petra Žižek", ["TENANT"], "041 903 551");

  // ---------- Properties & units ----------
  const p1 = await prisma.property.create({
    data: { ownerId: landlord.id, type: "APARTMENT", name: "Stanovanje Maribor", street: "Gosposka ulica 14", postalCode: "2000", city: "Maribor", notes: "Blok, upravnik Domplan.", createdAt: at(0, 1, 10) },
  });
  const p2 = await prisma.property.create({
    data: { ownerId: landlord.id, type: "MULTI_UNIT_HOUSE", name: "Hiša Murska Sobota", street: "Cankarjeva ulica 8", postalCode: "9000", city: "Murska Sobota", createdAt: at(0, 1, 10, 20) },
  });
  const p3 = await prisma.property.create({
    data: { ownerId: landlord.id, type: "COMMERCIAL", name: "Pisarna Lendavska", street: "Lendavska ulica 30", postalCode: "9000", city: "Murska Sobota", notes: "Poslovni prostor v pritličju, 48 m².", createdAt: at(0, 1, 10, 40) },
  });
  const u1 = await prisma.unit.create({ data: { propertyId: p1.id, name: "Stanovanje 2B", floor: "2. nadstropje", createdAt: at(0, 1, 10) } });
  const u2 = await prisma.unit.create({ data: { propertyId: p2.id, name: "Pritličje", floor: "pritličje", createdAt: at(0, 1, 10, 20) } });
  const u3 = await prisma.unit.create({ data: { propertyId: p2.id, name: "Mansarda", floor: "mansarda", createdAt: at(0, 1, 10, 21) } });
  const u4 = await prisma.unit.create({ data: { propertyId: p3.id, name: "Pisarna 1", floor: "pritličje", createdAt: at(0, 1, 10, 40) } });

  const payee = { payeeName: landlord.name!, payeeIban: LANDLORD_IBAN, payeeStreet: "Gosposka ulica 3", payeeCity: "2000 Maribor" };
  const T3_END = 8; // previous mansarda tenant moves out at the end of month 8
  const T4_START = 10;
  const T5_START = 3;
  const lastIdx = MONTHS - 1;

  // ---------- Tenancies ----------
  // T1: one tenant, rent + separate monthly cost advances, yearly settlement (tenant pays the difference).
  const t1 = await createTenancy({
    unitId: u1.id, startIdx: 0, endIdx: null, rentCents: 55000, rentDueDay: 5, depositCents: 110000, billingMode: "SEPARATE", splitMethod: "EQUAL",
    coveredCosts: ["RENT", "HEATING", "WATER", "BUILDING_MANAGEMENT", "ELECTRICITY"], noticePeriodDays: 60, rentReviewMonth: 1, ...payee,
    paymentNote: "Lahko tudi Flik: 041 555 210",
  }, [{ user: jure.id }], { lateDays: (i) => (i === 6 ? 4 : i === 15 ? 2 : 0), reportedBy: "TENANT" });

  // T2: couple, pavšal (rent + advances in one payment), split 50/50, settlement with a credit paid back.
  const t2 = await createTenancy({
    unitId: u2.id, startIdx: 0, endIdx: null, rentCents: 68000, rentDueDay: 8, depositCents: 136000, billingMode: "COMBINED", splitMethod: "PERCENTAGE",
    coveredCosts: ["RENT", "ELECTRICITY", "WATER", "WASTE"], noticePeriodDays: 90, ...payee,
  }, [{ user: maja.id, shareBasisPoints: 5000 }, { user: rok.id, shareBasisPoints: 5000 }], {
    lateDays: (i, mi) => (mi === 1 && (i === 4 || i === 13 || i === 19) ? between(2, 6) : 0),
    override: (i, mi) => (i === lastIdx && mi === 1 ? "REPORTED_PAID" : null),
    reportedBy: "TENANT",
  });

  // T3: previous mansarda tenant – ended, deposit returned with a deduction.
  const t3 = await createTenancy({
    unitId: u3.id, startIdx: 0, endIdx: T3_END, rentCents: 42000, rentDueDay: 3, depositCents: 84000, billingMode: "SEPARATE", splitMethod: "EQUAL",
    coveredCosts: ["RENT", "ELECTRICITY"], noticePeriodDays: 30, ...payee,
  }, [{ user: tina.id }], { lateDays: (i) => (i === 2 ? 3 : 0), reportedBy: "TENANT" });

  // T4: new mansarda tenant – this month's rent is overdue.
  const t4 = await createTenancy({
    unitId: u3.id, startIdx: T4_START, endIdx: null, rentCents: 45000, rentDueDay: 3, depositCents: 90000, billingMode: "SEPARATE", splitMethod: "EQUAL",
    coveredCosts: ["RENT", "ELECTRICITY"], noticePeriodDays: 30, ...payee,
  }, [{ user: zan.id }], {
    lateDays: (i) => (i === T4_START + 3 ? 9 : i === T4_START + 7 ? 5 : 0),
    override: (i, _mi, type) => (i === lastIdx && type === "RENT" ? "OVERDUE" : null),
    reportedBy: "TENANT",
  });

  // T5: office – landlord records payments from the bank statement, electricity paid straight to the supplier.
  const t5 = await createTenancy({
    unitId: u4.id, startIdx: T5_START, endIdx: null, rentCents: 80000, rentDueDay: 25, depositCents: 160000, billingMode: "SEPARATE", splitMethod: "EQUAL",
    coveredCosts: ["RENT", "ELECTRICITY", "CLEANING"], noticePeriodDays: 90, rentReviewMonth: 1, ...payee,
  }, [{ user: petra.id }], { lateDays: () => 0, reportedBy: "LANDLORD" });

  // ---------- Rent (with yearly indexation for T1 and T5) ----------
  const jan1 = firstJanuaryFrom(12);
  const rentAt = new Map<string, (i: number) => number>([
    [t1.id, (i) => (jan1 !== null && i >= jan1 ? 57500 : 55000)],
    [t2.id, () => 68000],
    [t3.id, () => 42000],
    [t4.id, () => 45000],
    [t5.id, (i) => (jan1 !== null && i >= jan1 ? 82400 : 80000)],
  ]);
  if (jan1 !== null) {
    for (const [t, before, after, note] of [
      [t1, 55000, 57500, "Uskladitev z inflacijo po pogodbi (čl. 5)."],
      [t5, 80000, 82400, "Letna uskladitev +3 % po pogodbi."],
    ] as const) {
      await prisma.rentChange.create({ data: { tenancyId: t.id, effectiveFrom: day(jan1, 1), rentCents: after, previousCents: before, note, createdById: landlordId, createdAt: at(jan1 - 1, 2, 18), appliedAt: at(jan1, 1, 0, 5) } });
      await prisma.tenancy.update({ where: { id: t.id }, data: { rentCents: after } });
    }
  }

  // Cost advances (akontacije).
  const adv1: [CostType, number][] = [["HEATING", 5500], ["WATER", 1800], ["BUILDING_MANAGEMENT", 2500]];
  const adv2: [CostType, number][] = [["ELECTRICITY", 7500], ["WATER", 2200], ["WASTE", 1400]];
  for (const [costType, amountCents] of adv1) await prisma.costAdvance.create({ data: { tenancyId: t1.id, costType, amountCents, createdAt: at(0, 1, 11) } });
  for (const [costType, amountCents] of adv2) await prisma.costAdvance.create({ data: { tenancyId: t2.id, costType, amountCents, createdAt: at(0, 1, 11) } });

  for (const t of [t1, t2, t3, t4, t5]) {
    const last = t.endIdx ?? lastIdx;
    for (let i = t.startIdx; i <= last; i++) {
      const { period } = ym(i);
      const rent = rentAt.get(t.id)!(i);
      const due = day(i, t.rentDueDay);
      if (t.id === t2.id) {
        const lines = [{ costType: "RENT" as const, amountCents: rent }, ...adv2.map(([costType, amountCents]) => ({ costType, amountCents }))];
        const total = lines.reduce((s, l) => s + l.amountCents, 0);
        const title = `Najemnina in stroški ${monthName(i)}`;
        await addCharge(t, i, { type: "RENT", costType: "RENT", title, purpose: title, amountCents: total, dueDate: due, rentPeriod: period, autoKey: `combined:${period}`, purposeCode: "RENT", createdAt: at(i, 1, 1) }, lines);
      } else {
        const title = `Najemnina ${monthName(i)}`;
        await addCharge(t, i, { type: "RENT", costType: "RENT", title, purpose: title, amountCents: rent, dueDate: due, rentPeriod: period, purposeCode: "RENT", createdAt: at(i, 1, 1) }, [{ costType: "RENT", amountCents: rent }]);
      }
      if (t.id === t1.id) {
        const title = `Akontacija stroškov ${monthName(i)}`;
        const total = adv1.reduce((s, [, a]) => s + a, 0);
        await addCharge(t, i, { type: "ADVANCE", costType: null, title, purpose: title, amountCents: total, dueDate: due, autoKey: `advance:${period}`, purposeCode: "OTHR", createdAt: at(i, 1, 1, 1) }, adv1.map(([costType, amountCents]) => ({ costType, amountCents })));
      }
    }
  }

  // ---------- Bills ----------
  // Mansarda: landlord passes the electricity bill on every two months (one meter for the attic).
  for (const t of [t3, t4]) {
    const last = t.endIdx ?? lastIdx;
    // Billed in month i for the two finished months before it (the last bill after moving out may cover one month).
    for (let i = t.startIdx + 2; i <= last + 2 && i <= lastIdx; i += 2) {
      const from = i - 2;
      const to = Math.min(i - 1, last);
      const amount = Math.round((winter(from) ? between(6800, 8900) : between(3900, 5600)) / (to === from ? 2 : 1));
      const title = to === from ? `Elektrika ${monthName(from)}` : `Elektrika ${MONTHS_SL[ym(from).m - 1]}–${monthName(to)}`;
      await addCharge(t, i, {
        type: "BILL", costType: "ELECTRICITY", title, purpose: title, amountCents: amount, dueDate: day(i, 18), purposeCode: PURPOSE_CODE_BY_COST.ELECTRICITY,
        description: "Račun za elektriko mansarde (ločen števec).", createdById: landlordId, createdAt: at(i, 6, 19),
      });
    }
  }
  // Office: monthly electricity bill paid straight to the supplier, plus cleaning of common areas each quarter.
  for (let i = T5_START + 1; i <= lastIdx; i++) {
    const prev = i - 1;
    const amount = winter(prev) ? between(9500, 13800) : shoulder(prev) ? between(7000, 8800) : between(5200, 7400);
    const title = `Elektrika ${monthName(prev)}`;
    await addCharge(t5, i, {
      type: "BILL", costType: "ELECTRICITY", title, purpose: `Električna energija ${ym(prev).period}`, amountCents: amount, dueDate: day(i, 18),
      payTo: "SUPPLIER", payeeName: "Energija Mura d.o.o.", payeeIban: SUPPLIER_IBAN, payeeStreet: "Industrijska ulica 7", payeeCity: "9000 Murska Sobota",
      purposeCode: PURPOSE_CODE_BY_COST.ELECTRICITY, createdById: landlordId, createdAt: at(i, 5, 8),
    });
    if (ym(i).m % 3 === 1) {
      const t = `Čiščenje skupnih prostorov ${MONTHS_SL[ym(i - 3).m - 1]}–${MONTHS_SL[ym(prev).m - 1]}`;
      await addCharge(t5, i, { type: "OTHER", costType: "CLEANING", title: t, purpose: t, amountCents: 4500, dueDate: day(i, 25), purposeCode: PURPOSE_CODE_BY_COST.CLEANING, createdById: landlordId, createdAt: at(i, 2, 10) });
    }
  }

  // ---------- Actual monthly costs (for settlements) ----------
  const actual = new Map<string, Map<CostType, number>>(); // tenancyId:period → costType → cents
  const addEntry = async (tenancyId: string, i: number, costType: CostType, amountCents: number, note?: string) => {
    const { period } = ym(i);
    const key = `${tenancyId}:${period}`;
    const map = actual.get(key) ?? new Map<CostType, number>();
    map.set(costType, amountCents);
    actual.set(key, map);
    await prisma.costEntry.create({ data: { tenancyId, period, costType, amountCents, note: note ?? null, createdById: landlordId, createdAt: at(Math.min(i + 1, lastIdx), 12, 20) } });
  };
  for (let i = 0; i < lastIdx; i++) {
    // T1: heating is seasonal; the advance of 55 € is a bit too low in winter.
    await addEntry(t1.id, i, "HEATING", winter(i) ? between(10500, 13200) : shoulder(i) ? between(5200, 6600) : between(600, 1100), "Energetika Maribor");
    await addEntry(t1.id, i, "WATER", between(1450, 2150));
    await addEntry(t1.id, i, "BUILDING_MANAGEMENT", 2540, "Upravnik");
    // T2: electricity below the advance most months → credit at the settlement.
    await addEntry(t2.id, i, "ELECTRICITY", winter(i) ? between(7400, 9100) : between(4300, 6300));
    await addEntry(t2.id, i, "WATER", between(1700, 2400));
    await addEntry(t2.id, i, "WASTE", 1386, "Saubermacher");
  }

  // ---------- Settlements (yearly; the first one also covers the starting month) ----------
  for (const t of [t1, t2]) {
    let from = t.startIdx;
    for (let y = ym(t.startIdx).y; y < CUR_Y; y++) {
      const to = (y - ym(0).y) * 12 + (12 - ym(0).m); // index of December of year y
      if (to < from || to - from + 1 < 6) continue;
      await createSettlement(t, from, to, t.id === t1.id ? adv1 : adv2, actual);
      from = to + 1;
    }
  }

  // ---------- Deposits ----------
  for (const [t, withCharge] of [[t1, true], [t2, false], [t4, true], [t5, false]] as const) {
    const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: t.id } });
    let chargeId: string | null = null;
    if (withCharge) {
      chargeId = await addCharge(t, t.startIdx, { type: "DEPOSIT", costType: null, title: "Varščina", purpose: "Varščina", amountCents: tenancy.depositCents!, dueDate: addDays(day(t.startIdx, 1), -3), purposeCode: "DEPT", createdById: landlordId, createdAt: addDays(at(t.startIdx, 1, 9), -6) });
    }
    await prisma.deposit.create({ data: { tenancyId: t.id, amountCents: tenancy.depositCents!, status: "HELD", chargeId, receivedOn: addDays(day(t.startIdx, 1), -4), createdAt: at(t.startIdx, 1, 9) } });
  }

  // ---------- Handovers (move-in for everyone, move-out for T3) ----------
  const rooms = (kitchen: string) => [
    ["Predsoba", "Vhodna vrata in ključavnica", "GOOD"],
    ["Kuhinja", kitchen, "GOOD"],
    ["Kuhinja", "Hladilnik", "GOOD"],
    ["Kopalnica", "Tuš kabina", "WORN"],
    ["Dnevna soba", "Kavč", "GOOD"],
    ["Spalnica", "Omara", "GOOD"],
  ] as const;
  const meterStart = { [u1.id]: ["WATER", 412_350n], [u2.id]: ["ELECTRICITY", 18_204_000n], [u3.id]: ["ELECTRICITY", 7_812_000n], [u4.id]: ["ELECTRICITY", 30_455_000n] } as Record<string, [string, bigint]>;
  for (const t of [t1, t2, t3, t4, t5]) {
    const office = t.id === t5.id;
    const items = office
      ? [["Pisarna", "Klimatska naprava", "GOOD"], ["Pisarna", "Talna obloga", "WORN"], ["Čajna kuhinja", "Pult in korito", "GOOD"], ["Sanitarije", "WC in umivalnik", "GOOD"]]
      : rooms(t.id === t3.id || t.id === t4.id ? "Kuhinjski pult" : "Štedilnik");
    const [meterType, base] = meterStart[t.unitId]!;
    const value = base + BigInt(t.startIdx) * (meterType === "WATER" ? 7_500n : 260_000n);
    await createHandover(t, "MOVE_IN", addDays(day(t.startIdx, 1), -1), items as unknown as [string, string, string][], meterType as "WATER" | "ELECTRICITY", value);
  }
  const moveOut = await createHandover(t3, "MOVE_OUT", monthEnd(T3_END), [
    ["Predsoba", "Vhodna vrata in ključavnica", "GOOD"],
    ["Kuhinja", "Kuhinjski pult", "DAMAGED"],
    ["Kuhinja", "Hladilnik", "GOOD"],
    ["Kopalnica", "Tuš kabina", "WORN"],
    ["Dnevna soba", "Kavč", "WORN"],
    ["Spalnica", "Omara", "GOOD"],
  ], "ELECTRICITY", meterStart[u3.id]![1] + BigInt(T3_END + 1) * 260_000n, "Pult ob koritu nabrekel od vode, ostalo običajna obraba.");
  const damaged = moveOut.items.find((it) => it.condition === "DAMAGED")!;
  // T3 deposit: paid at the start, returned at the end minus the damaged worktop.
  const t3DepositCharge = await addCharge(t3, 0, { type: "DEPOSIT", costType: null, title: "Varščina", purpose: "Varščina", amountCents: 84000, dueDate: addDays(day(0, 1), -3), purposeCode: "DEPT", createdById: landlordId, createdAt: addDays(at(0, 1, 9), -6) });
  await prisma.deposit.create({
    data: {
      tenancyId: t3.id, amountCents: 84000, status: "RETURNED", chargeId: t3DepositCharge, receivedOn: addDays(day(0, 1), -4), returnCents: 78000,
      proposalNote: "Odbitek za zamenjavo kuhinjskega pulta ob koritu (račun mizarja priložen v sporočilih).", proposedAt: at(T3_END + 1, 4, 17),
      agreedAt: at(T3_END + 1, 5, 20), agreedById: tina.id, returnedOn: day(T3_END + 1, 8), receiptConfirmedAt: at(T3_END + 1, 9, 12), createdAt: at(0, 1, 9),
      deductions: { create: [{ reason: "Zamenjava dela kuhinjskega pulta ob koritu", amountCents: 6000, handoverItemId: damaged.id, createdAt: at(T3_END + 1, 4, 17) }] },
    },
  });

  // ---------- Meter readings (quarterly, tenants send them) ----------
  for (const t of [t1, t2, t3, t4, t5]) {
    const [meterType, base] = meterStart[t.unitId]!;
    const last = t.endIdx ?? lastIdx;
    for (let i = t.startIdx + 3; i <= last; i += 3) {
      const step = meterType === "WATER" ? 7_500n : BigInt(between(230, 330)) * 1000n;
      const value = base + BigInt(i) * (meterType === "WATER" ? 7_500n : 260_000n) + step / 10n;
      await prisma.meterReading.create({
        data: { unitId: t.unitId, tenancyId: t.id, meterType: meterType as "WATER" | "ELECTRICITY", meterLabel: meterType === "WATER" ? "Hladna voda" : "Glavni števec", valueMilli: value, readOn: day(i, 1), recordedById: t.members[0]!.userId, createdAt: at(i, 1, 19) },
      });
    }
  }

  // ---------- Issues, messages ----------
  await seedConversation(t1, [
    [0, 2, 18, "L", "Dobrodošel v stanovanju! Vse obveznosti boš videl tukaj, plačilne podatke dobiš s QR kodo."],
    [0, 2, 20, "T", "Hvala, super. Ključ od kleti je pri vas ali v stanovanju?"],
    [0, 3, 8, "L", "V predalu v predsobi, z modrim obeskom."],
    [6, 9, 21, "T", "Najemnino za ta mesec bom poravnal par dni kasneje, oprostite."],
    [6, 9, 22, "L", "Ni problema, hvala za obvestilo."],
  ]);
  await seedIssue(t1, 2, 6, "HEATING", "Radiator v spalnici ne greje", "Radiator je čisto hladen, ostali delajo normalno.", "NORMAL", 3, [
    [2, 6, 19, "L", "Bom poklical serviserja, da ga odzrači. Ali ti ustreza jutri popoldne?"],
    [2, 7, 7, "T", "Ja, od 15. ure naprej sem doma."],
    [2, 8, 17, "T", "Serviser je bil, radiator spet greje. Hvala!"],
  ]);
  await seedIssue(t1, lastIdx - 1, 14, "WINDOWS_DOORS", "Okno v dnevni sobi se težko zapira", "Kljuka se zatika, okno se ne zapre do konca.", "LOW", null, [
    [lastIdx - 1, 14, 20, "L", "Hvala. Mizar ima prost termin čez dva tedna, ga naročim."],
  ]);

  await seedConversation(t2, [
    [0, 1, 17, "L", "Pozdravljena oba! Najemnina in akontacija stroškov sta v enem plačilu, vsak plača svojo polovico."],
    [0, 1, 19, "T", "Odlično, hvala za jasna navodila."],
    [7, 3, 10, "L", "Obvestilo: v sredo bo krovec popravljal streho, prosim pustita dvorišče prosto."],
    [lastIdx, 9, 20, "T2", "Plačal sem svoj del, potrdilo je v aplikaciji."],
  ]);
  await seedIssue(t2, 9, 12, "APPLIANCE", "Pralni stroj ne ožema", "Po pranju ostane perilo mokro, program se ustavi na koncu.", "NORMAL", 8, [
    [9, 12, 20, "L", "Stroj je star 11 let, popravilo se ne splača. Naročil sem novega."],
    [9, 19, 18, "T", "Nov stroj je priklopljen, deluje odlično. Hvala!"],
  ]);

  await seedConversation(t3, [
    [0, 2, 16, "T", "Pozdravljeni, ali lahko na balkon postavim manjši žar na elektriko?"],
    [0, 2, 18, "L", "Električni je v redu, na oglje pa ne zaradi sosedov."],
    [T3_END - 1, 28, 19, "T", "Kot dogovorjeno, se izselim konec naslednjega meseca. Kdaj bi naredila primopredajo?"],
    [T3_END - 1, 29, 8, "L", "Zadnji dan v mesecu ob 17h? Prinesi vse ključe, odčitava še števec."],
    [T3_END + 1, 4, 17, "L", "Predlagal sem vračilo varščine. Odbitek je samo za pult, račun mizarja je 60 €."],
    [T3_END + 1, 5, 20, "T", "Razumem, se strinjam. Hvala za korekten odnos!"],
  ]);

  await seedConversation(t4, [
    [T4_START, 1, 15, "L", "Dobrodošel! Elektriko mansarde ti zaračunam vsaka dva meseca po računu."],
    [T4_START, 1, 18, "T", "Velja, hvala."],
    [T4_START + 3, 6, 9, "T", "Ta mesec malo zamujam s plačilom, poravnam do 12."],
  ]);
  await seedIssue(t4, lastIdx, Math.max(1, TODAY.getUTCDate() - 2), "PLUMBING", "Kaplja pipa v kopalnici", "Pipa nad umivalnikom kaplja tudi, ko je čisto zaprta.", "NORMAL", null, []);
  await seedConversation(t4, [[lastIdx, Math.max(1, TODAY.getUTCDate() - 1), 21, "T", "Najemnino za ta mesec nakažem v petek, ko dobim plačo. Se opravičujem za zamudo."]]);

  await seedConversation(t5, [
    [T5_START, 1, 9, "L", "Pozdravljeni, plačila bom potrjeval sproti iz bančnega izpiska. Elektriko plačujete neposredno dobavitelju."],
    [T5_START, 1, 11, "T", "Odlično, hvala. Račun za elektriko boste naložili v aplikacijo?"],
    [T5_START, 1, 12, "L", "Ja, vsak mesec do 5., s QR kodo za plačilo."],
  ]);
  await seedIssue(t5, T5_START + 11, 21, "APPLIANCE", "Klima pušča vodo", "Iz notranje enote kaplja voda na tla, pod njo je mokro.", "URGENT", 1, [
    [T5_START + 11, 21, 10, "L", "Serviser pride danes ob 14h."],
    [T5_START + 11, 22, 16, "T", "Odtok je bil zamašen, zdaj je vse v redu."],
  ]);

  // Read markers: landlord has read everything except Žan's newest message and issue.
  for (const t of [t1, t2, t3, t4, t5]) {
    const landlordRead = t.id === t4.id ? addDays(NOW, -3) : NOW;
    await prisma.conversationRead.create({ data: { tenancyId: t.id, userId: landlordId, lastReadAt: landlordRead } });
    for (const m of t.members) await prisma.conversationRead.create({ data: { tenancyId: t.id, userId: m.userId, lastReadAt: NOW } });
  }

  // ---------- Landlord's own costs (tax overview) ----------
  const expenses: [string, string | null, Prisma.ExpenseCreateManyInput["category"], string, number, number, number][] = [];
  for (let i = 0; i <= lastIdx; i++) {
    if (ym(i).m % 3 === 0) expenses.push([p1.id, null, "RESERVE_FUND", `Rezervni sklad ${ym(i).y} Q${ym(i).m / 3}`, 10800, i, 15]);
    if (ym(i).m === 3) {
      expenses.push([p1.id, null, "INSURANCE", `Zavarovanje stanovanja ${ym(i).y}`, 14520, i, 10]);
      expenses.push([p2.id, null, "INSURANCE", `Zavarovanje hiše ${ym(i).y}`, 26340, i, 10]);
      expenses.push([p3.id, null, "INSURANCE", `Zavarovanje poslovnega prostora ${ym(i).y}`, 19000, i, 10]);
    }
    if (ym(i).m === 6) {
      expenses.push([p1.id, null, "PROPERTY_TAX", `NUSZ ${ym(i).y}`, 6240, i, 28]);
      expenses.push([p2.id, null, "PROPERTY_TAX", `NUSZ ${ym(i).y}`, 11810, i, 28]);
      expenses.push([p3.id, null, "PROPERTY_TAX", `NUSZ ${ym(i).y}`, 21030, i, 28]);
    }
  }
  expenses.push([p2.id, null, "MAINTENANCE", "Popravilo strehe (zamenjava strešnikov)", 84000, 7, 6]);
  expenses.push([p2.id, u3.id, "RENOVATION", "Beljenje mansarde med najemnikoma", 65000, T3_END + 1, 14]);
  expenses.push([p2.id, u3.id, "MAINTENANCE", "Zamenjava dela kuhinjskega pulta", 6000, T3_END + 1, 3]);
  expenses.push([p2.id, u2.id, "EQUIPMENT", "Nov pralni stroj", 42900, 9, 16]);
  expenses.push([p1.id, u1.id, "MAINTENANCE", "Odzračevanje radiatorja (serviser)", 4500, 2, 8]);
  expenses.push([p3.id, u4.id, "MAINTENANCE", "Servis klimatske naprave", 12000, T5_START + 11, 21]);
  expenses.push([p3.id, u4.id, "MAINTENANCE", "Letni pregled gasilnih aparatov", 3800, lastIdx - 2, 11]);
  await prisma.expense.createMany({
    data: expenses
      .filter(([, , , , , i, d]) => day(i, d) <= TODAY)
      .map(([propertyId, unitId, category, title, amountCents, i, d]) => ({ ownerId: landlordId, propertyId, unitId, category, title, amountCents, spentOn: day(i, d), createdAt: at(i, d, 20) })),
  });

  printLogins();
}

// ---------- Builders ----------

async function createTenancy(
  data: Omit<Prisma.TenancyUncheckedCreateInput, "startDate" | "endDate" | "status"> & { unitId: string; startIdx: number; endIdx: number | null; rentDueDay: number; splitMethod: "EQUAL" | "PERCENTAGE" | "PER_PERSON" },
  members: { user: string; shareBasisPoints?: number }[],
  behaviour: Pick<TenancyCtx, "lateDays" | "override" | "reportedBy">,
): Promise<TenancyCtx> {
  const { startIdx, endIdx, ...rest } = data;
  const start = day(startIdx, 1);
  const tenancy = await prisma.tenancy.create({
    data: { ...rest, status: endIdx === null ? "ACTIVE" : "ENDED", startDate: start, endDate: endIdx === null ? null : monthEnd(endIdx), createdAt: addDays(start, -6) },
  });
  const created: Member[] = [];
  for (const [i, m] of members.entries()) {
    const row = await prisma.tenancyMember.create({
      data: { tenancyId: tenancy.id, userId: m.user, isPrimary: i === 0, shareBasisPoints: m.shareBasisPoints ?? null, joinedAt: addDays(start, -5), leftAt: endIdx === null ? null : monthEnd(endIdx), createdAt: addDays(start, -5) },
    });
    created.push({ id: row.id, userId: row.userId, isPrimary: row.isPrimary, shareBasisPoints: row.shareBasisPoints, personCount: row.personCount });
  }
  return { id: tenancy.id, unitId: data.unitId, startIdx, endIdx, rentDueDay: data.rentDueDay, splitMethod: data.splitMethod, members: created, ...behaviour };
}

type ChargeData = Omit<Prisma.ChargeUncheckedCreateInput, "tenancyId" | "payeeName" | "payeeIban" | "status"> & Partial<Pick<Prisma.ChargeUncheckedCreateInput, "payeeName" | "payeeIban">>;

/** Creates a charge with one share per member and the payment history that fits its due date. Returns its id. */
async function addCharge(t: TenancyCtx, monthIdx: number, data: ChargeData, lines: { costType: CostType; amountCents: number }[] = []): Promise<string> {
  const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: t.id }, select: { payeeName: true, payeeIban: true, payeeStreet: true, payeeCity: true } });
  const due = data.dueDate as Date;
  const parts = splitAmount(data.amountCents, t.members, t.splitMethod);

  const shares = t.members.map((m, mi) => {
    const amountCents = parts.get(m.id)!;
    if (due > TODAY) return { m, amountCents, status: "OPEN" as ChargeStatus, paidOn: null, confirmedAt: null };
    const forced = t.override?.(monthIdx, mi, String(data.type)) ?? null;
    if (forced === "OVERDUE" || forced === "OPEN") return { m, amountCents, status: forced, paidOn: null, confirmedAt: null };
    const late = t.lateDays(monthIdx, mi);
    const paidOn = late > 0 ? addDays(due, late) : addDays(due, -between(0, Math.min(4, due.getUTCDate() - 1)));
    const paid = paidOn > TODAY ? TODAY : paidOn;
    const confirmedAt = new Date(addDays(paid, between(0, 2)).getTime() + between(7, 19) * 3_600_000);
    if (forced === "REPORTED_PAID" || confirmedAt > NOW) return { m, amountCents, status: "REPORTED_PAID" as ChargeStatus, paidOn: paid, confirmedAt: null };
    return { m, amountCents, status: "CONFIRMED" as ChargeStatus, paidOn: paid, confirmedAt };
  });
  const statuses = shares.map((s) => s.status);
  const status: ChargeStatus = statuses.every((s) => s === "CONFIRMED") ? "CONFIRMED" : statuses.includes("OVERDUE") ? "OVERDUE" : statuses.includes("OPEN") ? "OPEN" : "REPORTED_PAID";

  const charge = await prisma.charge.create({
    data: {
      payeeName: tenancy.payeeName,
      payeeIban: tenancy.payeeIban,
      payeeStreet: tenancy.payeeStreet,
      payeeCity: tenancy.payeeCity,
      ...data,
      tenancyId: t.id,
      status,
      updatedAt: past(shares.reduce<Date>((d, s) => (s.confirmedAt && s.confirmedAt > d ? s.confirmedAt : d), (data.createdAt as Date | undefined) ?? NOW)),
      ...(lines.length ? { lines: { create: lines.map((l, i) => ({ ...l, sortOrder: i })) } } : {}),
    },
  });
  for (const s of shares) {
    const share = await prisma.chargeShare.create({
      data: { chargeId: charge.id, memberId: s.m.id, amountCents: s.amountCents, status: s.status, confirmedAt: s.confirmedAt, confirmedById: s.confirmedAt ? landlordId : null, createdAt: (data.createdAt as Date | undefined) ?? NOW },
    });
    if (!s.paidOn) continue;
    // The landlord sees rent in their own bank statement, but not what the tenant paid straight to a supplier.
    const byLandlord = t.reportedBy === "LANDLORD" && data.payTo !== "SUPPLIER";
    await prisma.paymentReport.create({
      data: {
        chargeShareId: share.id,
        reportedById: byLandlord ? landlordId : s.m.userId,
        source: byLandlord ? "LANDLORD" : "TENANT",
        paidOn: s.paidOn,
        amountCents: s.amountCents,
        status: s.status === "CONFIRMED" ? "ACCEPTED" : "PENDING",
        reviewedById: s.status === "CONFIRMED" ? landlordId : null,
        reviewedAt: s.confirmedAt,
        createdAt: past(new Date(s.paidOn.getTime() + 18 * 3_600_000)),
      },
    });
  }
  return charge.id;
}

async function createSettlement(t: TenancyCtx, fromIdx: number, toIdx: number, advances: [CostType, number][], actual: Map<string, Map<CostType, number>>) {
  const sent = at(toIdx + 2, 10, 18);
  if (sent >= NOW) return;
  const lines = advances.map(([costType, perMonth], sortOrder) => {
    let actualCents = 0;
    for (let i = fromIdx; i <= toIdx; i++) actualCents += actual.get(`${t.id}:${ym(i).period}`)?.get(costType) ?? 0;
    return { costType, advanceCents: perMonth * (toIdx - fromIdx + 1), actualCents, sortOrder };
  });
  const balance = lines.reduce((s, l) => s + l.actualCents - l.advanceCents, 0);
  const responded = at(toIdx + 2, 13, 20);
  const answered = responded < NOW;
  const base = {
    tenancyId: t.id,
    periodFrom: day(fromIdx, 1),
    periodTo: monthEnd(toIdx),
    note: balance > 0 ? "Ogrevanje je bilo pozimi dražje od akontacije, zato je razlika v tvojo škodo. Akontacijo za ogrevanje bom prilagodil." : "Elektrike je bilo manj, kot smo predvideli – razliko vam vrnem.",
    sentAt: sent,
    createdById: landlordId,
    createdAt: at(toIdx + 2, 8, 19),
    recommendedChoice: balance < 0 ? ("REFUND" as const) : null,
    lines: { create: lines },
  };
  if (!answered) return prisma.costSettlement.create({ data: { ...base, status: "SENT" } });

  if (balance > 0) {
    const due = day(toIdx + 3, 5);
    const title = `Poračun stroškov ${base.periodFrom.toISOString().slice(0, 10).split("-").reverse().join(". ")} – ${base.periodTo.toISOString().slice(0, 10).split("-").reverse().join(". ")}`;
    const chargeId = await addCharge(t, toIdx + 3, {
      type: "SETTLEMENT", costType: null, title, purpose: `Poračun stroškov ${ym(toIdx).y}`, amountCents: balance, dueDate: due,
      autoKey: `settlement:${ym(fromIdx).period}:${ym(toIdx).period}`, purposeCode: "OTHR", createdAt: responded,
    }, lines.filter((l) => l.actualCents !== l.advanceCents).map((l) => ({ costType: l.costType, amountCents: l.actualCents - l.advanceCents })));
    const paid = (await prisma.charge.findUniqueOrThrow({ where: { id: chargeId } })).status === "CONFIRMED";
    return prisma.costSettlement.create({ data: { ...base, status: paid ? "CLOSED" : "ACCEPTED", respondedAt: responded, dueDate: due, chargeId } });
  }
  if (balance < 0) {
    const refundedOn = day(toIdx + 2, 20);
    const refunded = refundedOn <= TODAY;
    return prisma.costSettlement.create({
      data: {
        ...base, status: refunded ? "CLOSED" : "ACCEPTED", respondedAt: responded, creditChoice: "REFUND",
        ...(refunded ? { refundedOn, refundedCents: -balance, refundConfirmedAt: past(at(toIdx + 2, 21, 19)) } : {}),
      },
    });
  }
  return prisma.costSettlement.create({ data: { ...base, status: "CLOSED", respondedAt: responded } });
}

async function createHandover(
  t: TenancyCtx,
  kind: "MOVE_IN" | "MOVE_OUT",
  on: Date,
  items: [string, string, string][],
  meterType: "WATER" | "ELECTRICITY",
  meterValue: bigint,
  notes?: string,
) {
  const tenant = t.members[0]!.userId;
  const done = new Date(on.getTime() + 17 * 3_600_000);
  return prisma.handover.create({
    data: {
      tenancyId: t.id, kind, status: "CONFIRMED", handoverOn: on, keysCount: 3, keysNote: "2× vhod, 1× poštni nabiralnik",
      notes: notes ?? null, createdById: landlordId, landlordConfirmedAt: done, tenantConfirmedAt: new Date(done.getTime() + 3_600_000), tenantConfirmedById: tenant, createdAt: done,
      items: { create: items.map(([room, name, condition], sortOrder) => ({ room, name, condition: condition as "GOOD" | "WORN" | "DAMAGED" | "MISSING", sortOrder, note: condition === "DAMAGED" ? "Nabreklo ob koritu" : null, createdAt: done })) },
      meterReadings: { create: [{ unitId: t.unitId, tenancyId: t.id, meterType, meterLabel: meterType === "WATER" ? "Hladna voda" : "Glavni števec", valueMilli: meterValue, readOn: on, recordedById: landlordId, createdAt: done }] },
    },
    include: { items: true },
  });
}

/** [monthIdx, day, hour, who ("L" landlord, "T" first tenant, "T2" second tenant), text] */
type Msg = [number, number, number, "L" | "T" | "T2", string];

async function seedConversation(t: TenancyCtx, msgs: Msg[], issueId?: string) {
  for (const [i, d, h, who, body] of msgs) {
    const authorId = who === "L" ? landlordId : who === "T2" ? t.members[1]!.userId : t.members[0]!.userId;
    await prisma.message.create({ data: { tenancyId: t.id, authorId, body, issueId: issueId ?? null, createdAt: at(i, d, h, between(0, 50)) } });
  }
}

async function seedIssue(
  t: TenancyCtx,
  i: number,
  d: number,
  category: "PLUMBING" | "ELECTRICAL" | "HEATING" | "APPLIANCE" | "WINDOWS_DOORS" | "OTHER",
  title: string,
  description: string,
  urgency: "LOW" | "NORMAL" | "URGENT",
  resolvedAfterDays: number | null,
  comments: Msg[],
) {
  const createdAt = at(i, d, 17);
  const resolvedAt = resolvedAfterDays === null ? null : past(addDays(createdAt, resolvedAfterDays));
  const issue = await prisma.issue.create({
    data: {
      tenancyId: t.id, reporterId: t.members[0]!.userId, category, title, description, urgency,
      status: resolvedAt ? "RESOLVED" : comments.length ? "IN_PROGRESS" : "NEW", resolvedAt, createdAt, updatedAt: resolvedAt ?? createdAt,
    },
  });
  for (const [ci, cd, ch, who, body] of comments) {
    const authorId = who === "L" ? landlordId : t.members[who === "T2" ? 1 : 0]!.userId;
    await prisma.issueComment.create({ data: { issueId: issue.id, authorId, body, createdAt: at(ci, cd, ch, between(0, 50)) } });
  }
  await seedConversation(t, [[i, d, 17, "T", `Nova prijava okvare: ${title}.`]], issue.id);
  return issue;
}

/** Removes this demo landlord's properties and everything under them (users stay). */
async function wipe(ownerId: string) {
  const tenancyIds = (await prisma.tenancy.findMany({ where: { unit: { property: { ownerId } } }, select: { id: true } })).map((t) => t.id);
  const chargeIds = (await prisma.charge.findMany({ where: { tenancyId: { in: tenancyIds } }, select: { id: true } })).map((c) => c.id);
  const handoverIds = (await prisma.handover.findMany({ where: { tenancyId: { in: tenancyIds } }, select: { id: true } })).map((h) => h.id);
  const issueIds = (await prisma.issue.findMany({ where: { tenancyId: { in: tenancyIds } }, select: { id: true } })).map((x) => x.id);
  const byTenancy = { tenancyId: { in: tenancyIds } };
  await prisma.$transaction([
    prisma.attachment.deleteMany({ where: { OR: [byTenancy, { expense: { ownerId } }] } }),
    prisma.paymentReport.deleteMany({ where: { chargeShare: { chargeId: { in: chargeIds } } } }),
    prisma.chargeShare.deleteMany({ where: { chargeId: { in: chargeIds } } }),
    prisma.depositDeduction.deleteMany({ where: { deposit: byTenancy } }),
    prisma.deposit.deleteMany({ where: byTenancy }),
    prisma.chargeLine.deleteMany({ where: { chargeId: { in: chargeIds } } }),
    prisma.settlementLine.deleteMany({ where: { settlement: byTenancy } }),
    prisma.costSettlement.deleteMany({ where: byTenancy }),
    prisma.message.deleteMany({ where: byTenancy }),
    prisma.charge.deleteMany({ where: { id: { in: chargeIds } } }),
    prisma.costEntry.deleteMany({ where: byTenancy }),
    prisma.costAdvance.deleteMany({ where: byTenancy }),
    prisma.rentChange.deleteMany({ where: byTenancy }),
    prisma.issueComment.deleteMany({ where: { issueId: { in: issueIds } } }),
    prisma.issue.deleteMany({ where: { id: { in: issueIds } } }),
    prisma.conversationRead.deleteMany({ where: byTenancy }),
    prisma.meterReading.deleteMany({ where: { unit: { property: { ownerId } } } }),
    prisma.handoverItem.deleteMany({ where: { handoverId: { in: handoverIds } } }),
    prisma.handover.deleteMany({ where: { id: { in: handoverIds } } }),
    prisma.document.deleteMany({ where: { OR: [byTenancy, { unit: { property: { ownerId } } }] } }),
    prisma.invitation.deleteMany({ where: byTenancy }),
    prisma.tenancyMember.deleteMany({ where: byTenancy }),
    prisma.tenancy.deleteMany({ where: { id: { in: tenancyIds } } }),
    prisma.expense.deleteMany({ where: { ownerId } }),
    prisma.unit.deleteMany({ where: { property: { ownerId } } }),
    prisma.property.deleteMany({ where: { ownerId } }),
  ]);
  console.log("Stari demo podatki izbrisani.");
}

function printLogins() {
  console.log(`Demo podatki (${ym(0).period} – ${ym(MONTHS - 1).period}). Prijava z geslom ${PASSWORD}:`);
  for (const [email, who] of [
    [LANDLORD_EMAIL, "najemodajalec – 3 nepremičnine, 4 enote"],
    ["jure@kvito.test", "Stanovanje Maribor, akontacije + poračun"],
    ["maja@kvito.test", "Hiša MS / Pritličje, pavšal 50 %"],
    ["rok@kvito.test", "Hiša MS / Pritličje, pavšal 50 %"],
    ["tina@kvito.test", "Hiša MS / Mansarda, končan najem"],
    ["zan@kvito.test", "Hiša MS / Mansarda, zamuda ta mesec"],
    ["petra@kvito.test", "Pisarna Lendavska, elektrika dobavitelju"],
  ] as const) console.log(`  ${email.padEnd(20)} ${who}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err: unknown) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
