import { Router } from "express";
import { z } from "zod";
import { audit } from "../../lib/audit.js";
import { todayInLjubljana } from "../../lib/dates.js";
import { notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { authUserId } from "../../middleware/auth.js";
import { annualCsv, loadAnnualSummary, renderAnnualPdf } from "./annual.js";
import { loadPaymentRows, paymentsCsv, renderPaymentsPdf } from "./payments.js";

const AnnualQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  format: z.enum(["json", "csv", "pdf"]).default("json"),
});

const ExportQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  format: z.enum(["csv", "pdf"]).default("csv"),
});

export function reportsRouter(): Router {
  const router = Router();

  /**
   * Landlord overview: per tenancy how much is open / overdue / waiting for confirmation.
   * Amounts are the full shares, so the totals match what the landlord is owed.
   */
  router.get("/overview", async (req, res) => {
    const userId = authUserId(req);
    const shares = await prisma.chargeShare.findMany({
      where: {
        deletedAt: null,
        status: { in: ["OPEN", "OVERDUE", "REPORTED_PAID", "DISPUTED"] },
        charge: { deletedAt: null, tenancy: { deletedAt: null, unit: { deletedAt: null, property: { ownerId: userId, deletedAt: null } } } },
      },
      select: { status: true, amountCents: true, charge: { select: { tenancyId: true } } },
    });

    const empty = () => ({ openCount: 0, openCents: 0, overdueCount: 0, overdueCents: 0, waitingCount: 0, waitingCents: 0, disputedCount: 0 });
    const totals = empty();
    const byTenancy: Record<string, ReturnType<typeof empty>> = {};
    for (const s of shares) {
      const row = (byTenancy[s.charge.tenancyId] ??= empty());
      for (const r of [row, totals]) {
        if (s.status === "OPEN") {
          r.openCount++;
          r.openCents += s.amountCents;
        } else if (s.status === "OVERDUE") {
          r.overdueCount++;
          r.overdueCents += s.amountCents;
          // Overdue money is also still "open" to collect.
          r.openCents += s.amountCents;
        } else if (s.status === "REPORTED_PAID") {
          r.waitingCount++;
          r.waitingCents += s.amountCents;
        } else r.disputedCount++;
      }
    }
    res.json({ totals, byTenancy });
  });

  /** Years in which the landlord has confirmed payments, newest first (for the export picker). */
  router.get("/exports/years", async (req, res) => {
    const userId = authUserId(req);
    const rows = await prisma.chargeShare.findMany({
      where: { deletedAt: null, status: "CONFIRMED", confirmedAt: { not: null }, charge: { deletedAt: null, tenancy: { unit: { property: { ownerId: userId } } } } },
      select: { confirmedAt: true },
    });
    const years = new Set<number>([todayInLjubljana().getUTCFullYear()]);
    for (const r of rows) years.add(Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Ljubljana", year: "numeric" }).format(r.confirmedAt!)));
    res.json({ years: [...years].sort((a, b) => b - a) });
  });

  /** Received (confirmed) payments of a calendar year as CSV or PDF. */
  router.get("/exports/payments", async (req, res) => {
    const userId = authUserId(req);
    const q = ExportQuery.parse(req.query);
    const year = q.year ?? todayInLjubljana().getUTCFullYear();
    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { name: true, email: true } });
    if (!user) throw notFound();

    const rows = await loadPaymentRows(userId, year);
    await audit({ actorId: userId, entityType: "User", entityId: userId, action: "export.payments", after: { year, format: q.format, rows: rows.length }, ip: req.ip });

    if (q.format === "pdf") {
      const pdf = await renderPaymentsPdf(rows, year, user.name ?? user.email);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="kvito-prejeta-placila-${year}.pdf"`);
      res.send(pdf);
      return;
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="kvito-prejeta-placila-${year}.csv"`);
    res.send(paymentsCsv(rows));
  });

  /** Yearly summary of received money by unit and month: rent, costs, deposit, other (JSON, CSV or PDF). */
  router.get("/annual", async (req, res) => {
    const userId = authUserId(req);
    const q = AnnualQuery.parse(req.query);
    const year = q.year ?? todayInLjubljana().getUTCFullYear();
    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { name: true, email: true } });
    if (!user) throw notFound();
    const summary = await loadAnnualSummary(userId, year);
    if (q.format === "json") {
      res.json({ summary });
      return;
    }
    await audit({ actorId: userId, entityType: "User", entityId: userId, action: "export.annual", after: { year, format: q.format }, ip: req.ip });
    if (q.format === "pdf") {
      const pdf = await renderAnnualPdf(summary, user.name ?? user.email);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="kvito-letni-povzetek-${year}.pdf"`);
      res.send(pdf);
      return;
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="kvito-letni-povzetek-${year}.csv"`);
    res.send(annualCsv(summary));
  });

  return router;
}
