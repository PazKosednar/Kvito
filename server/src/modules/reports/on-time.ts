import type { Prisma } from "../../generated/prisma/client.js";
import { todayInLjubljana } from "../../lib/dates.js";
import { onTimeMonths, type OnTimeShare } from "../../lib/on-time.js";
import { prisma } from "../../lib/prisma.js";

/** Months paid on time per tenancy (for the town's reward garden), for the tenancies matching `where`. */
export async function onTimeMonthsByTenancy(where: Prisma.TenancyWhereInput): Promise<Record<string, number>> {
  const today = todayInLjubljana();
  const shares = await prisma.chargeShare.findMany({
    where: { deletedAt: null, charge: { deletedAt: null, dueDate: { lte: today }, tenancy: where } },
    select: {
      status: true,
      confirmedAt: true,
      charge: { select: { tenancyId: true, dueDate: true } },
      paymentReports: { where: { status: "ACCEPTED", deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1, select: { paidOn: true } },
    },
  });
  const byTenancy = new Map<string, OnTimeShare[]>();
  for (const s of shares) {
    const list = byTenancy.get(s.charge.tenancyId) ?? [];
    list.push({ dueDate: s.charge.dueDate, status: s.status, paidOn: s.paymentReports[0]?.paidOn ?? null, confirmedAt: s.confirmedAt });
    byTenancy.set(s.charge.tenancyId, list);
  }
  const out: Record<string, number> = {};
  for (const [id, list] of byTenancy) out[id] = onTimeMonths(list, today);
  return out;
}
