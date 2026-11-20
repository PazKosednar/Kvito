import { todayInLjubljana } from "../../lib/dates.js";
import { prisma } from "../../lib/prisma.js";
import { loadAnnualSummary } from "./annual.js";

export interface ProfitUnit {
  unitId: string;
  unit: string;
  propertyId: string;
  property: string;
  /** Rent received (confirmed) in the year. */
  rentCents: number;
  /** Other money received (e.g. repairs billed to the tenant); cost advances and deposits are not income here. */
  otherCents: number;
  /** The landlord's own costs entered for this unit. */
  unitCostsCents: number;
  /** Its equal share of costs entered for the whole property. */
  sharedCostsCents: number;
  netCents: number;
  /** Months of the year (so far) with a tenancy running. */
  occupiedMonths: number;
}

export interface Profitability {
  year: number;
  /** 12 for past years, the current month number for this year. */
  monthsElapsed: number;
  units: ProfitUnit[];
  totals: { rentCents: number; otherCents: number; costsCents: number; netCents: number };
  /** Property costs that could not be split because the property has no units. */
  unassignedCostsCents: number;
  years: number[];
}

/**
 * What each unit earned in a year: rent and other money received minus the landlord's own costs.
 * Costs entered for a whole property are split equally between its units. Running costs paid by the tenant
 * (advances, bills) pass through to suppliers and are left out on both sides. Informative, not accounting.
 */
export async function loadProfitability(ownerId: string, year: number): Promise<Profitability> {
  const today = todayInLjubljana();
  const thisYear = today.getUTCFullYear();
  const monthsElapsed = year < thisYear ? 12 : year === thisYear ? today.getUTCMonth() + 1 : 0;
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const [summary, tenancies, expenses, firstTenancy] = await Promise.all([
    loadAnnualSummary(ownerId, year),
    prisma.tenancy.findMany({
      where: { deletedAt: null, status: { in: ["ACTIVE", "ENDED"] }, unit: { property: { ownerId } } },
      select: { id: true, unitId: true, startDate: true, endDate: true },
    }),
    prisma.expense.findMany({
      where: { ownerId, deletedAt: null, spentOn: { gte: yearStart, lt: yearEnd } },
      select: { propertyId: true, unitId: true, amountCents: true },
    }),
    prisma.tenancy.findFirst({ where: { deletedAt: null, unit: { property: { ownerId } } }, orderBy: { startDate: "asc" }, select: { startDate: true } }),
  ]);

  const tenancyUnit = new Map(tenancies.map((t) => [t.id, t.unitId]));
  // All tenancies (also drafts) map to units for the money received.
  const allTenancies = await prisma.tenancy.findMany({ where: { id: { in: summary.units.map((u) => u.tenancyId) } }, select: { id: true, unitId: true } });
  for (const t of allTenancies) tenancyUnit.set(t.id, t.unitId);
  const earningUnitIds = [...new Set(summary.units.map((u) => tenancyUnit.get(u.tenancyId)).filter((x): x is string => Boolean(x)))];

  // Units that exist now, plus removed ones that still earned money in the year.
  const units = await prisma.unit.findMany({
    where: { property: { ownerId }, OR: [{ deletedAt: null, property: { deletedAt: null } }, { id: { in: earningUnitIds } }] },
    orderBy: [{ property: { createdAt: "asc" } }, { createdAt: "asc" }],
    select: { id: true, name: true, deletedAt: true, property: { select: { id: true, name: true } } },
  });

  const rows = new Map<string, ProfitUnit>(
    units.map((u) => [u.id, { unitId: u.id, unit: u.name, propertyId: u.property.id, property: u.property.name, rentCents: 0, otherCents: 0, unitCostsCents: 0, sharedCostsCents: 0, netCents: 0, occupiedMonths: 0 }]),
  );

  for (const a of summary.units) {
    const row = rows.get(tenancyUnit.get(a.tenancyId) ?? "");
    if (!row) continue;
    row.rentCents += a.totals.rent;
    row.otherCents += a.totals.other;
  }

  let unassignedCostsCents = 0;
  const liveByProperty = new Map<string, string[]>();
  for (const u of units) if (!u.deletedAt) liveByProperty.set(u.property.id, [...(liveByProperty.get(u.property.id) ?? []), u.id]);
  for (const e of expenses) {
    const own = e.unitId ? rows.get(e.unitId) : undefined;
    if (own) {
      own.unitCostsCents += e.amountCents;
      continue;
    }
    const shareIds = liveByProperty.get(e.propertyId) ?? [];
    if (!shareIds.length) {
      unassignedCostsCents += e.amountCents;
      continue;
    }
    // Equal split; the cents that do not divide evenly go to the first units.
    const base = Math.floor(e.amountCents / shareIds.length);
    let rest = e.amountCents - base * shareIds.length;
    for (const id of shareIds) {
      rows.get(id)!.sharedCostsCents += base + (rest > 0 ? 1 : 0);
      rest--;
    }
  }

  for (const row of rows.values()) {
    const months = new Set<number>();
    for (const t of tenancies.filter((x) => x.unitId === row.unitId)) {
      for (let m = 0; m < monthsElapsed; m++) {
        const monthStart = new Date(Date.UTC(year, m, 1));
        const monthEnd = new Date(Date.UTC(year, m + 1, 0));
        if (t.startDate <= monthEnd && (!t.endDate || t.endDate >= monthStart)) months.add(m);
      }
    }
    row.occupiedMonths = months.size;
    row.netCents = row.rentCents + row.otherCents - row.unitCostsCents - row.sharedCostsCents;
  }

  const list = [...rows.values()];
  const totals = list.reduce(
    (s, r) => ({
      rentCents: s.rentCents + r.rentCents,
      otherCents: s.otherCents + r.otherCents,
      costsCents: s.costsCents + r.unitCostsCents + r.sharedCostsCents,
      netCents: s.netCents + r.netCents,
    }),
    { rentCents: 0, otherCents: 0, costsCents: 0, netCents: 0 },
  );
  totals.costsCents += unassignedCostsCents;
  totals.netCents -= unassignedCostsCents;

  const first = Math.min(firstTenancy?.startDate.getUTCFullYear() ?? thisYear, thisYear);
  const years = Array.from({ length: thisYear - first + 1 }, (_, i) => thisYear - i);
  return { year, monthsElapsed, units: list, totals, unassignedCostsCents, years };
}
