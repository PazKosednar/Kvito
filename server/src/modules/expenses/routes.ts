import express, { Router } from "express";
import { z } from "zod";
import { audit } from "../../lib/audit.js";
import { randomToken } from "../../lib/crypto.js";
import { toDateOnly, todayInLjubljana } from "../../lib/dates.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { cleanFileName, extensionFor, MAX_UPLOAD_BYTES, sniffMime } from "../../lib/files.js";
import { prisma } from "../../lib/prisma.js";
import { estimateRentalTax, filingDeadline, rateOptions } from "../../lib/rental-tax.js";
import { dateOnly, idParam, optionalText, positiveCents, text } from "../../lib/validation.js";
import { authUserId } from "../../middleware/auth.js";
import { uploadLimiter } from "../../middleware/rateLimit.js";
import { validateBody } from "../../middleware/validate.js";
import type { Storage } from "../../services/storage/Storage.js";
import { assertPropertyOwner } from "../access/access.js";
import { attachmentDto, attachmentSelect } from "../attachments/service.js";
import { loadAnnualSummary } from "../reports/annual.js";
import { assertStorageFor } from "../billing/plans.js";
import { csvCell } from "../../lib/csv.js";

export const EXPENSE_CATEGORIES = [
  "MAINTENANCE",
  "RENOVATION",
  "RESERVE_FUND",
  "MANAGEMENT",
  "INSURANCE",
  "PROPERTY_TAX",
  "UTILITIES",
  "EQUIPMENT",
  "OTHER",
] as const;

const ExpenseBody = z.object({
  propertyId: idParam,
  unitId: idParam.nullable().optional(),
  category: z.enum(EXPENSE_CATEGORIES),
  title: text(120),
  amountCents: positiveCents,
  spentOn: dateOnly,
  note: optionalText(500),
  attachmentIds: z.array(idParam).max(5).optional(),
});

const YearQuery = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() });
const TaxQuery = YearQuery.extend({
  rate: z.coerce.number().int().optional(),
  format: z.enum(["json", "csv"]).default("json"),
});
const UploadQuery = z.object({ name: z.string().max(200).optional() });

const MAX_EXPENSE_FILES = 5;

const yearRange = (year: number) => ({ gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) });

const expenseInclude = {
  property: { select: { id: true, name: true } },
  unit: { select: { id: true, name: true } },
  attachments: attachmentSelect,
} as const;

type ExpenseRow = Awaited<ReturnType<typeof loadExpenses>>[number];

function expenseDto(e: ExpenseRow) {
  return {
    id: e.id,
    property: e.property,
    unit: e.unit,
    category: e.category,
    title: e.title,
    amountCents: e.amountCents,
    spentOn: toDateOnly(e.spentOn),
    note: e.note,
    attachments: e.attachments.map(attachmentDto),
  };
}

export function loadExpenses(ownerId: string, year: number) {
  return prisma.expense.findMany({
    where: { ownerId, deletedAt: null, spentOn: yearRange(year), property: { deletedAt: null } },
    orderBy: [{ spentOn: "desc" }, { createdAt: "desc" }],
    include: expenseInclude,
  });
}

/** The unit must belong to the chosen property. */
async function assertUnitOfProperty(unitId: string | null | undefined, propertyId: string): Promise<void> {
  if (!unitId) return;
  const unit = await prisma.unit.findFirst({ where: { id: unitId, propertyId, deletedAt: null }, select: { id: true } });
  if (!unit) throw badRequest("UNIT_NOT_IN_PROPERTY");
}

/** Links freshly uploaded receipts (uploaded by the same landlord, not linked yet). */
async function claimReceipts(db: Pick<typeof prisma, "attachment">, ids: string[] | undefined, ownerId: string, expenseId: string): Promise<void> {
  if (!ids?.length) return;
  const unique = [...new Set(ids)];
  const { count } = await db.attachment.updateMany({
    where: { id: { in: unique }, uploadedById: ownerId, kind: "EXPENSE", tenancyId: null, expenseId: null, deletedAt: null },
    data: { expenseId },
  });
  if (count !== unique.length) throw badRequest("ATTACHMENT_INVALID");
}

/** Landlord's own costs and the yearly tax overview (mounted behind requireAuth in app.ts). */
export function expensesRouter(deps: { storage: Storage }): Router {
  const router = Router();

  router.get("/expenses", async (req, res) => {
    const userId = authUserId(req);
    const year = YearQuery.parse(req.query).year ?? todayInLjubljana().getUTCFullYear();
    const rows = await loadExpenses(userId, year);
    res.json({ year, expenses: rows.map(expenseDto) });
  });

  router.get("/expenses/:id", async (req, res) => {
    const userId = authUserId(req);
    const id = idParam.parse(req.params.id);
    const expense = await prisma.expense.findFirst({ where: { id, ownerId: userId, deletedAt: null }, include: expenseInclude });
    if (!expense) throw notFound();
    res.json({ expense: expenseDto(expense) });
  });

  router.post("/expenses", validateBody(ExpenseBody), async (req, res) => {
    const userId = authUserId(req);
    const body = req.body as z.infer<typeof ExpenseBody>;
    await assertPropertyOwner(userId, body.propertyId);
    await assertUnitOfProperty(body.unitId, body.propertyId);
    const expense = await prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          ownerId: userId,
          propertyId: body.propertyId,
          unitId: body.unitId ?? null,
          category: body.category,
          title: body.title,
          amountCents: body.amountCents,
          spentOn: body.spentOn,
          note: body.note ?? null,
        },
      });
      await claimReceipts(tx, body.attachmentIds, userId, created.id);
      return tx.expense.findUniqueOrThrow({ where: { id: created.id }, include: expenseInclude });
    });
    await audit({ actorId: userId, entityType: "Expense", entityId: expense.id, action: "expense.create", after: { amountCents: expense.amountCents, category: expense.category }, ip: req.ip });
    res.status(201).json({ expense: expenseDto(expense) });
  });

  router.patch("/expenses/:id", validateBody(ExpenseBody), async (req, res) => {
    const userId = authUserId(req);
    const id = idParam.parse(req.params.id);
    const body = req.body as z.infer<typeof ExpenseBody>;
    const existing = await prisma.expense.findFirst({ where: { id, ownerId: userId, deletedAt: null }, select: { id: true } });
    if (!existing) throw notFound();
    await assertPropertyOwner(userId, body.propertyId);
    await assertUnitOfProperty(body.unitId, body.propertyId);
    const expense = await prisma.$transaction(async (tx) => {
      await tx.expense.update({
        where: { id },
        data: {
          propertyId: body.propertyId,
          unitId: body.unitId ?? null,
          category: body.category,
          title: body.title,
          amountCents: body.amountCents,
          spentOn: body.spentOn,
          note: body.note ?? null,
        },
      });
      const linked = await tx.attachment.count({ where: { expenseId: id, deletedAt: null } });
      if (linked + (body.attachmentIds?.length ?? 0) > MAX_EXPENSE_FILES) throw badRequest("TOO_MANY_PHOTOS");
      await claimReceipts(tx, body.attachmentIds, userId, id);
      return tx.expense.findUniqueOrThrow({ where: { id }, include: expenseInclude });
    });
    await audit({ actorId: userId, entityType: "Expense", entityId: id, action: "expense.update", ip: req.ip });
    res.json({ expense: expenseDto(expense) });
  });

  router.delete("/expenses/:id", async (req, res) => {
    const userId = authUserId(req);
    const id = idParam.parse(req.params.id);
    const existing = await prisma.expense.findFirst({ where: { id, ownerId: userId, deletedAt: null }, select: { id: true } });
    if (!existing) throw notFound();
    await prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit({ actorId: userId, entityType: "Expense", entityId: id, action: "expense.delete", ip: req.ip });
    res.status(204).end();
  });

  /** Upload a receipt (raw bytes in the body), linked to an expense when it is saved. Only for landlords. */
  router.post("/expenses/attachments", uploadLimiter, express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }), async (req, res) => {
    const userId = authUserId(req);
    const owns = await prisma.property.count({ where: { ownerId: userId, deletedAt: null } });
    if (!owns) throw notFound();
    const { name } = UploadQuery.parse(req.query);
    const body = req.body as unknown;
    if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest("FILE_EMPTY");
    await assertStorageFor(userId, body.length);
    const mime = sniffMime(body);
    if (!mime) throw badRequest("FILE_TYPE_NOT_ALLOWED");
    const key = `expenses/${userId}/${new Date().toISOString().slice(0, 7)}/${randomToken(16)}.${extensionFor(mime)}`;
    await deps.storage.put(key, body, mime);
    const att = await prisma.attachment.create({
      data: { kind: "EXPENSE", uploadedById: userId, storageKey: key, fileName: cleanFileName(name, mime), mimeType: mime, sizeBytes: body.length },
    });
    res.status(201).json({ attachment: attachmentDto(att) });
  });

  /** Yearly tax overview: rent received, own costs, flat-rate vs actual costs, informative tax (JSON or CSV). */
  router.get("/taxes", async (req, res) => {
    const userId = authUserId(req);
    const q = TaxQuery.parse(req.query);
    const year = q.year ?? todayInLjubljana().getUTCFullYear() - (todayInLjubljana().getUTCMonth() < 3 ? 1 : 0);
    const overview = await loadTaxOverview(userId, year, q.rate);
    if (q.format === "csv") {
      await audit({ actorId: userId, entityType: "User", entityId: userId, action: "export.taxes", after: { year }, ip: req.ip });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="kvito-davcni-pregled-${year}.csv"`);
      res.send(taxCsv(overview));
      return;
    }
    res.json({ overview });
  });

  return router;
}

export type TaxOverview = Awaited<ReturnType<typeof loadTaxOverview>>;

/** Everything the tax page (and the assistant) needs for one year. */
export async function loadTaxOverview(ownerId: string, year: number, ratePercent?: number) {
  const [summary, expenses, properties] = await Promise.all([
    loadAnnualSummary(ownerId, year),
    loadExpenses(ownerId, year),
    prisma.property.findMany({ where: { ownerId, deletedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
  ]);
  const options = rateOptions(year);
  const rate = options.find((o) => o.percent === ratePercent) ?? options[0]!;

  // Income per property: received rent only (costs passed on, deposits and other payments are shown apart).
  const byProperty = new Map(properties.map((p) => [p.id, { id: p.id, name: p.name, rentCents: 0, expensesCents: 0 }]));
  for (const u of summary.units) {
    const row = byProperty.get(u.propertyId);
    if (row) row.rentCents += u.totals.rent;
  }
  const byCategory = new Map<string, number>();
  for (const e of expenses) {
    const row = byProperty.get(e.property.id);
    if (row) row.expensesCents += e.amountCents;
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amountCents);
  }
  const expensesCents = expenses.reduce((s, e) => s + e.amountCents, 0);
  return {
    year,
    received: summary.totals,
    expensesCents,
    expensesByCategory: [...byCategory.entries()].map(([category, amountCents]) => ({ category, amountCents })),
    properties: [...byProperty.values()],
    rateOptions: options,
    estimate: estimateRentalTax(summary.totals.rent, expensesCents, rate.percent),
    rateKind: rate.kind,
    deadline: toDateOnly(filingDeadline(year)),
    expenses: expenses.map(expenseDto),
  };
}

/** Category names for the CSV (the client has its own translations). */
const CATEGORY_SL: Record<(typeof EXPENSE_CATEGORIES)[number], string> = {
  MAINTENANCE: "Vzdrževanje in popravila",
  RENOVATION: "Obnova in investicije",
  RESERVE_FUND: "Rezervni sklad",
  MANAGEMENT: "Upravljanje",
  INSURANCE: "Zavarovanje",
  PROPERTY_TAX: "Nadomestilo za stavbno zemljišče",
  UTILITIES: "Obratovalni stroški",
  EQUIPMENT: "Oprema",
  OTHER: "Drugo",
};

const eur = (c: number) => (c / 100).toFixed(2).replace(".", ",");

function taxCsv(o: TaxOverview): string {
  const rows: (string | number)[][] = [
    ["Davčni pregled (informativno)", String(o.year)],
    [],
    ["Prejete najemnine (EUR)", eur(o.estimate.incomeCents)],
    ["Normirani stroški 10 % (EUR)", eur(o.estimate.flatCostsCents)],
    ["Dejanski stroški (EUR)", eur(o.estimate.actualCostsCents)],
    ["Uporabljeni stroški", o.estimate.method === "ACTUAL" ? "dejanski" : "normirani"],
    ["Davčna osnova (EUR)", eur(o.estimate.baseCents)],
    [`Ocena dohodnine ${o.estimate.ratePercent} % (EUR)`, eur(o.estimate.taxCents)],
    ["Rok za napoved", o.deadline],
    [],
    ["Nepremičnina", "Prejete najemnine (EUR)", "Stroški (EUR)"],
    ...o.properties.map((p) => [p.name, eur(p.rentCents), eur(p.expensesCents)]),
    [],
    ["Datum", "Nepremičnina", "Enota", "Vrsta", "Opis", "Znesek (EUR)", "Opomba"],
    ...o.expenses.map((e) => [e.spentOn, e.property.name, e.unit?.name ?? "", CATEGORY_SL[e.category], e.title, eur(e.amountCents), e.note ?? ""]),
  ];
  // BOM + semicolons so Excel in Slovenian locale opens it correctly.
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
