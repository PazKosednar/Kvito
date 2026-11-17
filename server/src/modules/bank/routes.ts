import express, { Router } from "express";
import { z } from "zod";
import { chargeTitle } from "../../i18n/format.js";
import { StatementError, parseStatement, type BankEntry } from "../../lib/bank-statement.js";
import { badRequest } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { dateOnly, idParam } from "../../lib/validation.js";
import { authUserId } from "../../middleware/auth.js";
import { uploadLimiter } from "../../middleware/rateLimit.js";
import { validateBody } from "../../middleware/validate.js";
import { transitionShare } from "../charges/service.js";

const MAX_STATEMENT_BYTES = 5 * 1024 * 1024;

const ConfirmBody = z.object({
  items: z
    .array(z.object({ shareId: idParam, entryId: z.string().min(1).max(100), paidOn: dateOnly.nullable() }))
    .min(1)
    .max(200),
});

type MatchState = "READY" | "AMOUNT_DIFFERS" | "AMOUNT_UNKNOWN" | "ALREADY_CONFIRMED" | "DUPLICATE";

/** Shares behind Kvito references, but only on the caller's own properties and only payments to the landlord. */
async function ownShares(landlordId: string, refNos: number[]) {
  if (!refNos.length) return [];
  return prisma.chargeShare.findMany({
    where: {
      refNo: { in: refNos },
      deletedAt: null,
      charge: { deletedAt: null, payTo: "LANDLORD", tenancy: { deletedAt: null, unit: { property: { ownerId: landlordId } } } },
    },
    select: {
      id: true,
      refNo: true,
      amountCents: true,
      status: true,
      member: { select: { user: { select: { name: true, email: true } } } },
      charge: {
        select: {
          id: true,
          tenancyId: true,
          type: true,
          title: true,
          rentPeriod: true,
          autoKey: true,
          dueDate: true,
          tenancy: { select: { unit: { select: { name: true, property: { select: { name: true } } } } } },
        },
      },
    },
  });
}

/**
 * Bank statement import for landlords. The file is parsed in memory and never stored; the answer only lists
 * incoming payments, so the landlord sees what Kvito recognised before anything is confirmed.
 */
export function bankRouter(): Router {
  const router = Router();

  router.post("/bank-import/preview", uploadLimiter, express.raw({ type: () => true, limit: MAX_STATEMENT_BYTES }), async (req, res) => {
    const userId = authUserId(req);
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest("STATEMENT_EMPTY");
    let parsed: { format: "camt" | "csv"; entries: BankEntry[] };
    try {
      parsed = parseStatement(req.body);
    } catch (err) {
      if (err instanceof StatementError) throw badRequest(err.code);
      throw err;
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { locale: true } });
    const credits = parsed.entries.filter((e) => e.credit);
    const shares = await ownShares(userId, [...new Set(credits.map((e) => e.refNo).filter((n): n is number => n !== null))]);
    const byRef = new Map(shares.map((s) => [s.refNo, s]));

    const seen = new Set<string>();
    const matches: unknown[] = [];
    const unmatched: unknown[] = [];
    let foreignReferences = 0;
    for (const e of credits) {
      const share = e.refNo !== null ? byRef.get(e.refNo) : undefined;
      if (!share) {
        if (e.refNo !== null) foreignReferences++;
        else unmatched.push({ entryId: e.entryId, bookedOn: e.bookedOn, amountCents: e.amountCents, counterparty: e.counterparty, purpose: e.purpose, reference: e.reference });
        continue;
      }
      let state: MatchState;
      if (seen.has(share.id)) state = "DUPLICATE";
      else if (share.status === "CONFIRMED") state = "ALREADY_CONFIRMED";
      else if (e.amountCents === null) state = "AMOUNT_UNKNOWN";
      else if (e.amountCents !== share.amountCents) state = "AMOUNT_DIFFERS";
      else state = "READY";
      seen.add(share.id);
      matches.push({
        entryId: e.entryId,
        bookedOn: e.bookedOn,
        amountCents: e.amountCents,
        counterparty: e.counterparty,
        reference: e.reference,
        state,
        share: {
          id: share.id,
          chargeId: share.charge.id,
          tenancyId: share.charge.tenancyId,
          title: chargeTitle(share.charge, user.locale),
          place: `${share.charge.tenancy.unit.property.name} · ${share.charge.tenancy.unit.name}`,
          tenant: share.member.user.name ?? share.member.user.email,
          amountCents: share.amountCents,
          status: share.status,
          dueDate: share.charge.dueDate,
        },
      });
    }
    res.json({ format: parsed.format, entries: parsed.entries.length, credits: credits.length, matches, foreignReferences, unmatched });
  });

  /**
   * Confirms the selected matches. Every item is checked again: own share, still unconfirmed. The amount was
   * checked in the preview; the landlord's explicit choice is what confirms the payment.
   */
  router.post("/bank-import/confirm", validateBody(ConfirmBody), async (req, res) => {
    const userId = authUserId(req);
    const body = req.body as z.infer<typeof ConfirmBody>;
    const shares = await prisma.chargeShare.findMany({
      where: { id: { in: body.items.map((i) => i.shareId) }, deletedAt: null, charge: { deletedAt: null, payTo: "LANDLORD", tenancy: { unit: { property: { ownerId: userId } } } } },
      select: { id: true, chargeId: true, status: true },
    });
    let confirmed = 0;
    const skipped: { shareId: string; reason: string }[] = [];
    for (const item of body.items) {
      const share = shares.find((s) => s.id === item.shareId);
      if (!share) {
        skipped.push({ shareId: item.shareId, reason: "NOT_FOUND" });
        continue;
      }
      if (share.status === "CONFIRMED") {
        skipped.push({ shareId: item.shareId, reason: "ALREADY_CONFIRMED" });
        continue;
      }
      await transitionShare({
        chargeId: share.chargeId,
        shareId: share.id,
        action: "confirm",
        actorId: userId,
        role: "LANDLORD",
        memberId: null,
        ip: req.ip,
        bankEntry: { ref: item.entryId, paidOn: item.paidOn ?? null },
      });
      confirmed++;
    }
    res.json({ confirmed, skipped });
  });

  return router;
}

