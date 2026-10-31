import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { bus } from "../../lib/events.js";
import { formatMeterValue, parseMeterValue } from "../../lib/meters.js";
import { prisma } from "../../lib/prisma.js";
import { dateOnly, idParam, optionalText } from "../../lib/validation.js";
import { authUserId } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { assertTenancyAccess } from "../access/access.js";
import { attachmentDto, attachmentSelect, claimAttachments } from "../attachments/service.js";

export const METER_TYPES = ["ELECTRICITY", "WATER", "GAS", "HEAT"] as const;

export const ReadingBody = z.object({
  meterType: z.enum(METER_TYPES),
  meterLabel: optionalText(40),
  value: z.string().transform((v, ctx) => {
    const parsed = parseMeterValue(v);
    if (parsed === null) ctx.addIssue({ code: "custom", message: "INVALID_METER_VALUE" });
    return parsed ?? 0n;
  }),
  readOn: dateOnly,
  note: optionalText(500),
  attachmentIds: z.array(idParam).max(3).optional(),
});

export const readingInclude = {
  recordedBy: { select: { id: true, name: true, email: true } },
  attachments: attachmentSelect,
} satisfies Prisma.MeterReadingInclude;

type ReadingRow = Prisma.MeterReadingGetPayload<{ include: typeof readingInclude }>;

/** BigInt is not JSON – the API sends the reading as a decimal string ("12345,678"). */
export const readingDto = (r: ReadingRow) => ({
  id: r.id,
  unitId: r.unitId,
  tenancyId: r.tenancyId,
  handoverId: r.handoverId,
  meterType: r.meterType,
  meterLabel: r.meterLabel,
  value: formatMeterValue(r.valueMilli),
  valueMilli: Number(r.valueMilli),
  readOn: r.readOn,
  note: r.note,
  recordedBy: r.recordedBy,
  createdAt: r.createdAt,
  attachments: r.attachments.map(attachmentDto),
});

export async function createReading(
  db: Prisma.TransactionClient,
  opts: { tenancyId: string; unitId: string; userId: string; handoverId?: string | null; body: z.infer<typeof ReadingBody> },
) {
  const created = await db.meterReading.create({
    data: {
      unitId: opts.unitId,
      tenancyId: opts.tenancyId,
      handoverId: opts.handoverId ?? null,
      meterType: opts.body.meterType,
      meterLabel: opts.body.meterLabel ?? null,
      valueMilli: opts.body.value,
      readOn: opts.body.readOn,
      note: opts.body.note ?? null,
      recordedById: opts.userId,
    },
  });
  await claimAttachments(db, opts.body.attachmentIds, { tenancyId: opts.tenancyId, uploadedById: opts.userId, kinds: ["METER", "HANDOVER"], link: { meterReadingId: created.id } });
  return db.meterReading.findUniqueOrThrow({ where: { id: created.id }, include: readingInclude });
}

export function metersRouter(): Router {
  const router = Router();

  /** Landlords see the unit's whole history; tenants see readings made during their tenancy. */
  router.get("/tenancies/:id/meters", async (req, res) => {
    const userId = authUserId(req);
    const tenancyId = idParam.parse(req.params.id);
    const access = await assertTenancyAccess(userId, tenancyId);
    const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId }, select: { unitId: true } });
    const readings = await prisma.meterReading.findMany({
      where: { deletedAt: null, ...(access.role === "LANDLORD" ? { unitId: tenancy.unitId } : { tenancyId }) },
      include: readingInclude,
      orderBy: [{ readOn: "desc" }, { createdAt: "desc" }],
      take: 500,
    });
    res.json({ readings: readings.map(readingDto) });
  });

  router.post("/tenancies/:id/meters", validateBody(ReadingBody), async (req, res) => {
    const userId = authUserId(req);
    const tenancyId = idParam.parse(req.params.id);
    await assertTenancyAccess(userId, tenancyId);
    const body = req.body as z.infer<typeof ReadingBody>;
    const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId }, select: { unitId: true } });

    // A lower value than the last reading usually means a typo (or a replaced meter) – tell the client.
    const previous = await prisma.meterReading.findFirst({
      where: { unitId: tenancy.unitId, meterType: body.meterType, meterLabel: body.meterLabel ?? null, deletedAt: null, readOn: { lte: body.readOn } },
      orderBy: [{ readOn: "desc" }, { createdAt: "desc" }],
    });
    const reading = await prisma.$transaction((tx) => createReading(tx, { tenancyId, unitId: tenancy.unitId, userId, body }));
    bus.emit("tenancy.changed", { tenancyId, what: "meters" });
    res.status(201).json({ reading: readingDto(reading), lowerThanPrevious: !!previous && previous.valueMilli > body.value });
  });

  router.delete("/meters/:id", async (req, res) => {
    const userId = authUserId(req);
    const reading = await prisma.meterReading.findFirst({ where: { id: idParam.parse(req.params.id), deletedAt: null } });
    if (!reading || !reading.tenancyId) throw notFound();
    const access = await assertTenancyAccess(userId, reading.tenancyId);
    if (reading.recordedById !== userId && access.role !== "LANDLORD") throw notFound();
    if (reading.handoverId) throw badRequest("PART_OF_HANDOVER");
    await prisma.meterReading.update({ where: { id: reading.id }, data: { deletedAt: new Date() } });
    res.status(204).end();
  });

  return router;
}
