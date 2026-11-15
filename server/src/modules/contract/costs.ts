import { Router } from "express";
import { z } from "zod";
import type { CostType, Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { audit } from "../../lib/audit.js";
import { buildCostMatrix, isPeriod, monthsBetween, type CostMatrix } from "../../lib/costs.js";
import { parseDateOnly, periodOf, todayInLjubljana } from "../../lib/dates.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { bus } from "../../lib/events.js";
import { prisma } from "../../lib/prisma.js";
import { cents, costType, idParam, optionalText } from "../../lib/validation.js";
import { authUserId } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { assertTenancyAccess, assertTenancyLandlord } from "../access/access.js";
import { attachmentDto, attachmentSelect, claimAttachments } from "../attachments/service.js";
import { advanceLineWhere, availableCredit } from "./credit.js";

type Db = PrismaClient | Prisma.TransactionClient;

/** Longest range one request may ask for. */
const MAX_MONTHS = 36;
const MAX_ENTRY_FILES = 10;

const entryCostType = costType.exclude(["RENT"]);
const EntryBody = z.object({ amountCents: cents, note: optionalText(200) });
const AttachBody = z.object({ attachmentIds: z.array(idParam).min(1).max(10) });
const period = z.string().refine(isPeriod, "INVALID_MONTH");

const monthEnd = (p: string): Date => {
  const [y, m] = p.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0));
};
const monthStart = (p: string): Date => parseDateOnly(`${p}-01`);

/** Settlements that are out with the tenant fix their months: the entries cannot change any more. */
const LOCKING = ["SENT", "ACCEPTED", "CLOSED"] as const;

/** Month → id of the settlement that locks it. */
export async function lockedMonths(db: Db, tenancyId: string): Promise<Map<string, string>> {
  const rows = await db.costSettlement.findMany({
    where: { tenancyId, deletedAt: null, status: { in: [...LOCKING] } },
    select: { id: true, periodFrom: true, periodTo: true },
  });
  const out = new Map<string, string>();
  for (const s of rows) for (const p of monthsBetween(periodOf(s.periodFrom), periodOf(s.periodTo))) out.set(p, s.id);
  return out;
}

/** Monthly matrix of actual costs and charged advances for the given months. */
export async function costMatrix(db: Db, tenancyId: string, periods: string[]): Promise<CostMatrix> {
  if (!periods.length) return buildCostMatrix([], [], []);
  const from = monthStart(periods[0]!);
  const to = monthEnd(periods[periods.length - 1]!);
  const [entries, lines] = await Promise.all([
    db.costEntry.findMany({ where: { tenancyId, deletedAt: null, period: { in: periods } }, select: { period: true, costType: true, amountCents: true } }),
    db.chargeLine.findMany({ where: advanceLineWhere(tenancyId, from, to), select: { amountCents: true, charge: { select: { dueDate: true } } } }),
  ]);
  return buildCostMatrix(
    periods,
    entries,
    lines.map((l) => ({ period: periodOf(l.charge.dueDate), amountCents: l.amountCents })),
  );
}

/** Actual cost per type over the months of a settlement period. */
export async function actualByType(db: Db, tenancyId: string, from: Date, to: Date): Promise<Map<CostType, number>> {
  const rows = await db.costEntry.groupBy({
    by: ["costType"],
    where: { tenancyId, deletedAt: null, period: { in: monthsBetween(periodOf(from), periodOf(to)) } },
    _sum: { amountCents: true },
  });
  return new Map(rows.map((r) => [r.costType, r._sum.amountCents ?? 0]));
}

/**
 * Where the running balance starts: the month after the last settlement sent to the tenant, or the start of the
 * tenancy. Ends with the current month.
 */
async function runningWindow(tenancyId: string): Promise<{ from: string; to: string }> {
  const [tenancy, last] = await Promise.all([
    prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId }, select: { startDate: true } }),
    prisma.costSettlement.findFirst({ where: { tenancyId, deletedAt: null, status: { in: [...LOCKING] } }, orderBy: { periodTo: "desc" }, select: { periodTo: true } }),
  ]);
  const to = periodOf(todayInLjubljana());
  let from = periodOf(tenancy.startDate);
  if (last) {
    const next = periodOf(new Date(last.periodTo.getTime() + 86_400_000));
    if (next > from) from = next;
  }
  return { from: from > to ? to : from, to };
}

export function costsRouter(): Router {
  const router = Router();

  /**
   * Costs by month, for landlord and tenants. Without a range: the months since the last settlement, i.e. what the
   * next settlement will contain. `running` is the informative balance until then (credit already counted in).
   */
  router.get("/tenancies/:id/costs", async (req, res) => {
    const userId = authUserId(req);
    const tenancyId = idParam.parse(req.params.id);
    const access = await assertTenancyAccess(userId, tenancyId);
    const window = await runningWindow(tenancyId);
    const qFrom = typeof req.query["from"] === "string" ? period.parse(req.query["from"]) : window.from;
    const qTo = typeof req.query["to"] === "string" ? period.parse(req.query["to"]) : window.to;
    const periods = monthsBetween(qFrom, qTo);
    if (!periods.length) throw badRequest("END_BEFORE_START");
    if (periods.length > MAX_MONTHS) throw badRequest("RANGE_TOO_LONG");

    const [matrix, locks, entries, running, credit] = await Promise.all([
      costMatrix(prisma, tenancyId, periods),
      lockedMonths(prisma, tenancyId),
      prisma.costEntry.findMany({
        where: { tenancyId, deletedAt: null, period: { in: periods } },
        select: { id: true, period: true, costType: true, amountCents: true, note: true, attachments: attachmentSelect },
        orderBy: { period: "asc" },
      }),
      costMatrix(prisma, tenancyId, monthsBetween(window.from, window.to)),
      availableCredit(prisma, tenancyId),
    ]);
    res.json({
      from: qFrom,
      to: qTo,
      ...matrix,
      months: matrix.months.map((m) => ({ ...m, lockedBy: locks.get(m.period) ?? null })),
      entries: entries.map((e) => ({ ...e, attachments: e.attachments.map(attachmentDto) })),
      running: {
        from: window.from,
        to: window.to,
        advanceCents: running.totals.advanceCents,
        costCents: running.totals.costCents,
        creditCents: credit,
        /** > 0 the tenant would pay, < 0 the tenant is in credit. Informative until the settlement. */
        balanceCents: running.totals.balanceCents - credit,
      },
      access: access.role,
    });
  });

  /** Landlord enters (or corrects) the bill amount for a month and cost type. */
  router.put("/tenancies/:id/costs/:period/:costType", validateBody(EntryBody), async (req, res) => {
    const userId = authUserId(req);
    const tenancyId = idParam.parse(req.params.id);
    const p = period.parse(req.params.period);
    const type = entryCostType.parse(req.params.costType);
    await assertTenancyLandlord(userId, tenancyId);
    const body = req.body as z.infer<typeof EntryBody>;
    const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId }, select: { startDate: true } });
    if (p < periodOf(tenancy.startDate)) throw badRequest("MONTH_BEFORE_START");

    const entry = await prisma.$transaction(async (tx) => {
      const lock = (await lockedMonths(tx, tenancyId)).get(p);
      if (lock) throw badRequest("COST_ENTRY_LOCKED");
      const existing = await tx.costEntry.findFirst({ where: { tenancyId, period: p, costType: type, deletedAt: null } });
      const saved = existing
        ? await tx.costEntry.update({ where: { id: existing.id }, data: { amountCents: body.amountCents, note: body.note ?? null } })
        : await tx.costEntry.create({ data: { tenancyId, period: p, costType: type, amountCents: body.amountCents, note: body.note ?? null, createdById: userId } });
      await audit(
        {
          actorId: userId,
          entityType: "CostEntry",
          entityId: saved.id,
          action: existing ? "update" : "create",
          before: existing ? { amountCents: existing.amountCents } : undefined,
          after: { period: p, costType: type, amountCents: body.amountCents },
          ip: req.ip,
        },
        tx,
      );
      return saved;
    });
    bus.emit("tenancy.changed", { tenancyId, what: "contract" });
    res.json({ entry });
  });

  router.delete("/tenancies/:id/costs/:period/:costType", async (req, res) => {
    const userId = authUserId(req);
    const tenancyId = idParam.parse(req.params.id);
    const p = period.parse(req.params.period);
    const type = entryCostType.parse(req.params.costType);
    await assertTenancyLandlord(userId, tenancyId);
    await prisma.$transaction(async (tx) => {
      if ((await lockedMonths(tx, tenancyId)).get(p)) throw badRequest("COST_ENTRY_LOCKED");
      const existing = await tx.costEntry.findFirst({ where: { tenancyId, period: p, costType: type, deletedAt: null } });
      if (!existing) throw notFound();
      await tx.costEntry.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
      await audit({ actorId: userId, entityType: "CostEntry", entityId: existing.id, action: "delete", before: { period: p, costType: type, amountCents: existing.amountCents }, ip: req.ip }, tx);
    });
    bus.emit("tenancy.changed", { tenancyId, what: "contract" });
    res.status(204).end();
  });

  // ---------- Bills attached to a month's entry ----------

  async function loadEntry(id: string, userId: string) {
    const entry = await prisma.costEntry.findFirst({ where: { id, deletedAt: null }, select: { id: true, tenancyId: true, period: true } });
    if (!entry) throw notFound();
    await assertTenancyLandlord(userId, entry.tenancyId);
    return entry;
  }

  router.post("/cost-entries/:id/attachments", validateBody(AttachBody), async (req, res) => {
    const userId = authUserId(req);
    const entry = await loadEntry(idParam.parse(req.params.id), userId);
    const body = req.body as z.infer<typeof AttachBody>;
    const current = await prisma.attachment.count({ where: { costEntryId: entry.id, deletedAt: null } });
    if (current + new Set(body.attachmentIds).size > MAX_ENTRY_FILES) throw badRequest("TOO_MANY_ATTACHMENTS");
    await prisma.$transaction(async (tx) => {
      await claimAttachments(tx, body.attachmentIds, { tenancyId: entry.tenancyId, uploadedById: userId, kinds: ["BILL"], link: { costEntryId: entry.id } });
      await audit({ actorId: userId, entityType: "CostEntry", entityId: entry.id, action: "attach", after: { attachmentIds: body.attachmentIds }, ip: req.ip }, tx);
    });
    bus.emit("tenancy.changed", { tenancyId: entry.tenancyId, what: "contract" });
    const attachments = await prisma.attachment.findMany({ where: { costEntryId: entry.id, deletedAt: null }, select: attachmentSelect.select, orderBy: attachmentSelect.orderBy });
    res.status(201).json({ attachments: attachments.map(attachmentDto) });
  });

  router.delete("/cost-entries/:id/attachments/:attachmentId", async (req, res) => {
    const userId = authUserId(req);
    const entry = await loadEntry(idParam.parse(req.params.id), userId);
    const attachmentId = idParam.parse(req.params.attachmentId);
    const { count } = await prisma.attachment.updateMany({ where: { id: attachmentId, costEntryId: entry.id, deletedAt: null }, data: { deletedAt: new Date() } });
    if (!count) throw notFound();
    await audit({ actorId: userId, entityType: "CostEntry", entityId: entry.id, action: "detach", before: { attachmentId }, ip: req.ip });
    bus.emit("tenancy.changed", { tenancyId: entry.tenancyId, what: "contract" });
    res.status(204).end();
  });

  return router;
}
