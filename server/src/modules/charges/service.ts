import type { ChargeStatus, CostType, PayTo, Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { audit } from "../../lib/audit.js";
import { aggregateStatus, nextShareStatus, TransitionError, type ShareAction } from "../../lib/charge-status.js";
import { todayInLjubljana } from "../../lib/dates.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { bus } from "../../lib/events.js";
import { formatIban } from "../../lib/iban.js";
import { prisma } from "../../lib/prisma.js";
import { PURPOSE_CODE_BY_COST } from "../../lib/purpose-codes.js";
import { shareReference } from "../../lib/reference.js";
import { SplitError, splitAmount } from "../../lib/split.js";
import { buildUpnQrText, UpnError } from "../../lib/upnqr.js";
import { attachmentDto, attachmentSelect, claimAttachments } from "../attachments/service.js";
import { postSystemMessage } from "../messages/system.js";

type Db = PrismaClient | Prisma.TransactionClient;

export const chargeInclude = {
  shares: {
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      member: { select: { id: true, userId: true, user: { select: { id: true, name: true, email: true } } } },
      paymentReports: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: {
          reportedBy: { select: { id: true, name: true, email: true } },
          attachments: attachmentSelect,
        },
      },
    },
  },
  attachments: attachmentSelect,
} satisfies Prisma.ChargeInclude;

type ChargeRow = Prisma.ChargeGetPayload<{ include: typeof chargeInclude }>;

export function chargeDto(c: ChargeRow) {
  return {
    ...c,
    attachments: c.attachments.map(attachmentDto),
    shares: c.shares.map((s) => ({
      ...s,
      reference: c.payTo === "LANDLORD" ? shareReference(s.refNo) : c.reference,
      paymentReports: s.paymentReports.map((r) => ({ ...r, attachments: r.attachments.map(attachmentDto) })),
    })),
  };
}

const isPastDue = (dueDate: Date) => dueDate < todayInLjubljana();

/** Recomputes and stores the charge status from its shares. */
export async function refreshChargeStatus(db: Db, chargeId: string): Promise<ChargeStatus> {
  const shares = await db.chargeShare.findMany({ where: { chargeId, deletedAt: null }, select: { status: true } });
  const status = aggregateStatus(shares.map((s) => s.status));
  await db.charge.update({ where: { id: chargeId }, data: { status } });
  return status;
}

// ---------- Create ----------

export interface ChargeInput {
  type: "RENT" | "BILL" | "OTHER";
  costType: CostType | null;
  title: string;
  description?: string | null;
  amountCents: number;
  dueDate: Date;
  rentPeriod?: string | null;
  payTo: PayTo;
  payeeName?: string | null;
  payeeIban?: string | null;
  payeeStreet?: string | null;
  payeeCity?: string | null;
  reference?: string | null;
  purposeCode?: string | null;
  purpose?: string | null;
  attachmentIds?: string[];
}

/** Creates a charge and splits it between the tenancy's current members. Runs inside the given transaction. */
export async function createCharge(db: Prisma.TransactionClient, tenancyId: string, input: ChargeInput, actorId: string | null) {
  const tenancy = await db.tenancy.findFirst({
    where: { id: tenancyId, deletedAt: null },
    include: { members: { where: { deletedAt: null, leftAt: null }, orderBy: { joinedAt: "asc" } } },
  });
  if (!tenancy) throw notFound();
  if (tenancy.members.length === 0) throw badRequest("NO_MEMBERS");

  let parts: Map<string, number>;
  try {
    parts = splitAmount(input.amountCents, tenancy.members, tenancy.splitMethod);
  } catch (err) {
    if (err instanceof SplitError) throw badRequest(err.code);
    throw err;
  }

  const supplier = input.payTo === "SUPPLIER";
  if (supplier && (!input.payeeName || !input.payeeIban)) throw badRequest("SUPPLIER_PAYEE_REQUIRED");

  const pastDue = isPastDue(input.dueDate);
  const charge = await db.charge.create({
    data: {
      tenancyId,
      type: input.type,
      costType: input.costType,
      title: input.title,
      description: input.description ?? null,
      amountCents: input.amountCents,
      dueDate: input.dueDate,
      rentPeriod: input.rentPeriod ?? null,
      status: pastDue ? "OVERDUE" : "OPEN",
      payTo: input.payTo,
      payeeName: supplier ? input.payeeName! : tenancy.payeeName,
      payeeIban: supplier ? input.payeeIban! : tenancy.payeeIban,
      payeeStreet: supplier ? (input.payeeStreet ?? null) : tenancy.payeeStreet,
      payeeCity: supplier ? (input.payeeCity ?? null) : tenancy.payeeCity,
      reference: supplier ? (input.reference ?? null) : null,
      purposeCode: input.purposeCode ?? (input.costType ? PURPOSE_CODE_BY_COST[input.costType] : "OTHR"),
      purpose: input.purpose ?? null,
      createdById: actorId,
      shares: {
        create: tenancy.members.map((m) => ({
          memberId: m.id,
          amountCents: parts.get(m.id)!,
          status: pastDue ? ("OVERDUE" as const) : ("OPEN" as const),
        })),
      },
    },
  });

  if (actorId) {
    await claimAttachments(db, input.attachmentIds, {
      tenancyId,
      uploadedById: actorId,
      kinds: ["BILL"],
      link: { chargeId: charge.id },
    });
  }
  await audit(
    { actorId, entityType: "Charge", entityId: charge.id, action: "create", after: { amountCents: charge.amountCents, status: charge.status, dueDate: charge.dueDate } },
    db,
  );
  await postSystemMessage(db, tenancyId, "CHARGE_CREATED", { title: charge.title, amountCents: charge.amountCents }, { chargeId: charge.id });
  bus.emit("tenancy.changed", { tenancyId, what: "charges" });
  return charge;
}

// ---------- Share transitions ----------

const EVENT_FOR: Partial<Record<ShareAction, Parameters<typeof postSystemMessage>[2]>> = {
  report: "PAYMENT_REPORTED",
  confirm: "PAYMENT_CONFIRMED",
  reject: "PAYMENT_REJECTED",
  dispute: "CHARGE_DISPUTED",
};

export async function transitionShare(opts: {
  chargeId: string;
  shareId: string;
  action: Exclude<ShareAction, "markOverdue">;
  actorId: string;
  role: "LANDLORD" | "TENANT";
  memberId: string | null;
  ip?: string | undefined;
  report?: { paidOn: Date | null; note: string | null; attachmentIds?: string[] };
  reason?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const share = await tx.chargeShare.findFirst({
      where: { id: opts.shareId, chargeId: opts.chargeId, deletedAt: null, charge: { deletedAt: null } },
      include: { charge: true, member: { include: { user: true } } },
    });
    if (!share) throw notFound();

    let next: ChargeStatus;
    try {
      next = nextShareStatus(share.status, opts.action, {
        actor: opts.role,
        ownsShare: opts.role === "TENANT" && share.memberId === opts.memberId,
        isPastDue: isPastDue(share.charge.dueDate),
      });
    } catch (err) {
      if (err instanceof TransitionError) throw badRequest(err.code);
      throw err;
    }

    const now = new Date();
    await tx.chargeShare.update({
      where: { id: share.id },
      data: {
        status: next,
        ...(next === "CONFIRMED" ? { confirmedAt: now, confirmedById: opts.actorId } : { confirmedAt: null, confirmedById: null }),
      },
    });

    if (opts.action === "report") {
      const report = await tx.paymentReport.create({
        data: {
          chargeShareId: share.id,
          reportedById: opts.actorId,
          paidOn: opts.report?.paidOn ?? null,
          amountCents: share.amountCents,
          note: opts.report?.note ?? null,
        },
      });
      await claimAttachments(tx, opts.report?.attachmentIds, {
        tenancyId: share.charge.tenancyId,
        uploadedById: opts.actorId,
        kinds: ["PAYMENT_PROOF"],
        link: { paymentReportId: report.id },
      });
    }
    if (opts.action === "confirm" || opts.action === "reject") {
      await tx.paymentReport.updateMany({
        where: { chargeShareId: share.id, status: "PENDING", deletedAt: null },
        data: {
          status: opts.action === "confirm" ? "ACCEPTED" : "REJECTED",
          reviewedById: opts.actorId,
          reviewedAt: now,
          rejectReason: opts.action === "reject" ? (opts.reason ?? null) : null,
        },
      });
    }

    const chargeStatus = await refreshChargeStatus(tx, share.chargeId);
    await audit(
      {
        actorId: opts.actorId,
        entityType: "ChargeShare",
        entityId: share.id,
        action: opts.action,
        before: { status: share.status },
        after: { status: next, chargeStatus, ...(opts.reason ? { reason: opts.reason } : {}) },
        ip: opts.ip,
      },
      tx,
    );
    const event = EVENT_FOR[opts.action];
    if (event) {
      await postSystemMessage(
        tx,
        share.charge.tenancyId,
        event,
        {
          title: share.charge.title,
          amountCents: share.amountCents,
          name: share.member.user.name ?? share.member.user.email,
          reason: opts.reason ?? null,
        },
        { chargeId: share.chargeId },
      );
    }
    bus.emit("tenancy.changed", { tenancyId: share.charge.tenancyId, what: "charges" });
    return { status: next, chargeStatus };
  });
}

// ---------- Payment data (UPN) ----------

export async function paymentData(chargeId: string, shareId: string) {
  const share = await prisma.chargeShare.findFirst({
    where: { id: shareId, chargeId, deletedAt: null, charge: { deletedAt: null } },
    include: {
      member: { include: { user: true } },
      charge: { include: { tenancy: { include: { unit: { include: { property: true } } } } } },
    },
  });
  if (!share) throw notFound();
  const { charge } = share;
  const property = charge.tenancy.unit.property;
  const reference = charge.payTo === "LANDLORD" ? shareReference(share.refNo) : charge.reference;
  const purpose = (charge.purpose ?? charge.title).slice(0, 42);
  const purposeCode = charge.purposeCode ?? (charge.costType ? PURPOSE_CODE_BY_COST[charge.costType] : "OTHR");

  let qrText: string | null = null;
  let qrUnavailable: string | null = null;
  if (!charge.payeeStreet || !charge.payeeCity) {
    qrUnavailable = "PAYEE_ADDRESS_MISSING";
  } else {
    try {
      qrText = buildUpnQrText({
        payerName: share.member.user.name ?? share.member.user.email.split("@")[0]!,
        payerStreet: property.street,
        payerCity: `${property.postalCode} ${property.city}`,
        amountCents: share.amountCents,
        purposeCode,
        purpose,
        dueDate: charge.dueDate,
        payeeIban: charge.payeeIban,
        payeeReference: reference,
        payeeName: charge.payeeName,
        payeeStreet: charge.payeeStreet,
        payeeCity: charge.payeeCity,
      });
    } catch (err) {
      if (!(err instanceof UpnError)) throw err;
      qrUnavailable = `UPN_${err.field.toUpperCase()}`;
    }
  }

  return {
    chargeId,
    shareId,
    tenancyId: charge.tenancyId,
    payerEmail: share.member.user.email,
    payTo: charge.payTo,
    payeeName: charge.payeeName,
    payeeIban: formatIban(charge.payeeIban),
    payeeAddress: [charge.payeeStreet, charge.payeeCity].filter(Boolean).join(", ") || null,
    amountCents: share.amountCents,
    reference,
    purpose,
    purposeCode,
    dueDate: charge.dueDate,
    title: charge.title,
    qrText,
    qrUnavailable,
  };
}
