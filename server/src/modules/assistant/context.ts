import { toDateOnly, todayInLjubljana } from "../../lib/dates.js";
import { prisma } from "../../lib/prisma.js";
import { loadAnnualSummary } from "../reports/annual.js";
import { loadTaxOverview } from "../expenses/routes.js";

/**
 * A compact snapshot of one landlord's data for the assistant. Only what is needed to answer questions about
 * their properties: no e-mails, IBANs, message texts or files. Amounts in euros (2 decimals), dates YYYY-MM-DD.
 */
export async function landlordSnapshot(ownerId: string) {
  const today = todayInLjubljana();
  const year = today.getUTCFullYear();
  const owned = { unit: { deletedAt: null, property: { ownerId, deletedAt: null } } };
  const eur = (cents: number) => Math.round(cents) / 100;
  const personName = (u: { name: string | null }, i: number) => u.name?.trim() || `Najemnik ${i + 1}`;

  const [properties, shares, issues, deposits, thisYear, taxYear] = await Promise.all([
    prisma.property.findMany({
      where: { ownerId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        name: true,
        type: true,
        street: true,
        city: true,
        units: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
          select: {
            name: true,
            tenancies: {
              where: { deletedAt: null, status: { in: ["DRAFT", "ACTIVE"] } },
              orderBy: { startDate: "desc" },
              take: 1,
              select: {
                id: true,
                status: true,
                startDate: true,
                endDate: true,
                rentCents: true,
                members: { where: { deletedAt: null, leftAt: null }, select: { user: { select: { name: true } } } },
              },
            },
          },
        },
      },
    }),
    prisma.chargeShare.findMany({
      where: {
        deletedAt: null,
        status: { in: ["OPEN", "OVERDUE", "REPORTED_PAID", "DISPUTED"] },
        charge: { deletedAt: null, tenancy: { deletedAt: null, ...owned } },
      },
      orderBy: { charge: { dueDate: "asc" } },
      take: 60,
      select: {
        status: true,
        amountCents: true,
        member: { select: { user: { select: { name: true } } } },
        charge: { select: { title: true, type: true, dueDate: true, tenancy: { select: { unit: { select: { name: true, property: { select: { name: true } } } } } } } },
      },
    }),
    prisma.issue.findMany({
      where: { deletedAt: null, status: { in: ["NEW", "IN_PROGRESS"] }, tenancy: { deletedAt: null, ...owned } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { title: true, category: true, urgency: true, status: true, createdAt: true, tenancy: { select: { unit: { select: { name: true, property: { select: { name: true } } } } } } },
    }),
    prisma.deposit.findMany({
      where: { tenancy: { deletedAt: null, status: { in: ["DRAFT", "ACTIVE"] }, ...owned } },
      select: { amountCents: true, status: true, tenancy: { select: { unit: { select: { name: true, property: { select: { name: true } } } } } } },
    }),
    loadAnnualSummary(ownerId, year),
    // The return is filed in the first months of the year for the previous one.
    loadTaxOverview(ownerId, today.getUTCMonth() < 3 ? year - 1 : year),
  ]);

  const where = (t: { unit: { name: string; property: { name: string } } }) => `${t.unit.property.name} / ${t.unit.name}`;

  return {
    today: toDateOnly(today),
    properties: properties.map((p) => ({
      name: p.name,
      type: p.type,
      address: `${p.street}, ${p.city}`,
      units: p.units.map((u) => {
        const t = u.tenancies[0];
        return {
          name: u.name,
          tenancy: t
            ? {
                status: t.status,
                tenants: t.members.map((m, i) => personName(m.user, i)),
                rentEur: eur(t.rentCents),
                start: toDateOnly(t.startDate),
                end: t.endDate ? toDateOnly(t.endDate) : null,
              }
            : null,
        };
      }),
    })),
    unpaid: shares.map((s, i) => ({
      where: where(s.charge.tenancy),
      tenant: personName(s.member.user, i),
      title: s.charge.title,
      type: s.charge.type,
      amountEur: eur(s.amountCents),
      due: toDateOnly(s.charge.dueDate),
      status: s.status,
    })),
    openIssues: issues.map((x) => ({
      where: where(x.tenancy),
      title: x.title,
      category: x.category,
      urgency: x.urgency,
      status: x.status,
      reported: toDateOnly(x.createdAt),
    })),
    deposits: deposits.map((d) => ({ where: where(d.tenancy), amountEur: eur(d.amountCents), status: d.status })),
    receivedThisYear: {
      year,
      totalsEur: { rent: eur(thisYear.totals.rent), costs: eur(thisYear.totals.costs), deposit: eur(thisYear.totals.deposit), other: eur(thisYear.totals.other) },
      byUnit: thisYear.units.map((u) => ({ where: `${u.property} / ${u.unit}`, rentEur: eur(u.totals.rent), costsEur: eur(u.totals.costs) })),
    },
    taxEstimate: {
      year: taxYear.year,
      note: "Informativno. Stopnja 25 % velja zdaj; ZIURS (15 % oz. 5 %) bo veljal od leta 2026 le, če ga potrdi referendum 6. 12. 2026.",
      rentIncomeEur: eur(taxYear.estimate.incomeCents),
      flatCostsEur: eur(taxYear.estimate.flatCostsCents),
      ownCostsEur: eur(taxYear.estimate.actualCostsCents),
      method: taxYear.estimate.method,
      baseEur: eur(taxYear.estimate.baseCents),
      ratePercent: taxYear.estimate.ratePercent,
      taxEur: eur(taxYear.estimate.taxCents),
      returnDeadline: taxYear.deadline,
      costsByCategory: taxYear.expensesByCategory.map((c) => ({ category: c.category, amountEur: eur(c.amountCents) })),
    },
  };
}
