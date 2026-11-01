import PDFDocument from "pdfkit";
import type { Prisma } from "../../generated/prisma/client.js";
import { formatMeterValue, METER_UNITS } from "../../lib/meters.js";
import { C, drawLogo, registerFonts } from "../../lib/pdf.js";
import { prisma } from "../../lib/prisma.js";
import type { Storage } from "../../services/storage/Storage.js";
import type { handoverInclude } from "./routes.js";

type FullHandover = Prisma.HandoverGetPayload<{
  include: typeof handoverInclude & {
    tenancy: {
      include: {
        unit: { include: { property: { include: { owner: { select: { name: true; email: true } } } } } };
        members: { include: { user: { select: { name: true; email: true } } } };
      };
    };
  };
}>;

const CONDITION: Record<string, string> = { GOOD: "Brezhibno", WORN: "Obrabljeno", DAMAGED: "Poškodovano", MISSING: "Manjka" };
const METER: Record<string, string> = { ELECTRICITY: "Elektrika", WATER: "Voda", GAS: "Plin", HEAT: "Toplota" };

const day = (d: Date) => new Intl.DateTimeFormat("sl-SI", { timeZone: "UTC" }).format(d);
const stamp = (d: Date) =>
  new Intl.DateTimeFormat("sl-SI", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Ljubljana" }).format(d);

async function readImage(storage: Storage, key: string): Promise<Buffer | null> {
  try {
    const { stream } = await storage.get(key);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

export async function renderHandoverPdf(h: FullHandover, storage: Storage): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 64, left: 56, right: 56 }, bufferPages: true, info: { Title: "Zapisnik o primopredaji", Author: "Kvito" } });
  registerFonts(doc);

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  // Storage keys of all photos, fetched once.
  const photoIds = h.items.flatMap((i) => i.attachments.map((a) => a.id));
  const keys = new Map(
    (await prisma.attachment.findMany({ where: { id: { in: photoIds } }, select: { id: true, storageKey: true } })).map((a) => [a.id, a.storageKey]),
  );

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const kind = h.kind === "MOVE_IN" ? "vselitev" : "izselitev";
  const property = h.tenancy.unit.property;

  const eyebrow = (text: string, index?: string) => {
    doc.x = left;
    doc.font("mono-medium").fontSize(8).fillColor(C.ink);
    if (index) doc.text(`${index}  `, { continued: true, characterSpacing: 0.6 });
    doc.fillColor(C.faint).text(text.toUpperCase(), { characterSpacing: 0.6 });
  };
  const rule = () => {
    doc.moveDown(0.6);
    doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.moveDown(0.8);
  };
  const ensure = (space: number) => {
    if (doc.y + space > doc.page.height - doc.page.margins.bottom) doc.addPage();
  };
  const section = (index: string, title: string) => {
    ensure(80);
    doc.x = left;
    doc.moveDown(1.2);
    eyebrow(title, index);
    rule();
  };

  // ---- Header ----
  drawLogo(doc, left, 48, 20);
  doc.font("mono").fontSize(8).fillColor(C.faint).text(`Ustvarjeno ${stamp(new Date())}`, left, 54, { width, align: "right" });
  doc.y = 100;
  eyebrow(`Zapisnik o primopredaji — ${kind}`);
  doc.moveDown(0.4);
  doc.font("sans-semibold").fontSize(24).fillColor(C.ink).text(`Zapisnik ob ${h.kind === "MOVE_IN" ? "vselitvi" : "izselitvi"}`);
  doc.font("sans").fontSize(11).fillColor(C.muted).text(`${property.name}, ${h.tenancy.unit.name}`);
  doc.text(`${property.street}, ${property.postalCode} ${property.city}`);
  doc.font("mono").fontSize(10).fillColor(C.ink).moveDown(0.4).text(`Datum primopredaje: ${day(h.handoverOn)}`);

  // ---- Parties ----
  section("01", "Stranki");
  doc.font("sans-semibold").fontSize(10).fillColor(C.ink).text("Najemodajalec");
  doc.font("sans").fillColor(C.muted).text(`${property.owner.name ?? ""} ${property.owner.email}`.trim());
  doc.moveDown(0.6);
  doc.font("sans-semibold").fillColor(C.ink).text(h.tenancy.members.length > 1 ? "Najemniki" : "Najemnik");
  for (const m of h.tenancy.members) doc.font("sans").fillColor(C.muted).text(`${m.user.name ?? ""} ${m.user.email}`.trim());

  // ---- Keys ----
  section("02", "Ključi");
  doc.font("sans").fontSize(10).fillColor(C.ink).text(h.keysCount != null ? `Število ključev: ${h.keysCount}` : "Število ključev ni vpisano.");
  if (h.keysNote) doc.fillColor(C.muted).text(h.keysNote);

  // ---- Meters ----
  section("03", "Števci");
  if (h.meterReadings.length === 0) doc.font("sans").fontSize(10).fillColor(C.muted).text("Ni vpisanih odčitkov.");
  for (const r of h.meterReadings) {
    ensure(20);
    const y = doc.y;
    doc.font("sans").fontSize(10).fillColor(C.ink).text(`${METER[r.meterType]}${r.meterLabel ? ` (${r.meterLabel})` : ""}`, left, y, { width: width * 0.5 });
    doc.font("mono").text(`${formatMeterValue(r.valueMilli)} ${METER_UNITS[r.meterType]}`, left + width * 0.5, y, { width: width * 0.3, align: "right" });
    doc.font("mono").fillColor(C.faint).text(day(r.readOn), left + width * 0.8, y, { width: width * 0.2, align: "right" });
    doc.moveDown(0.3);
  }

  // ---- Rooms and items ----
  section("04", "Prostori in oprema");
  let currentRoom = "";
  for (const item of h.items) {
    ensure(40);
    if (item.room !== currentRoom) {
      currentRoom = item.room;
      doc.moveDown(0.4).font("sans-semibold").fontSize(11).fillColor(C.ink).text(item.room, left);
      doc.moveDown(0.2);
    }
    const y = doc.y;
    doc.font("sans").fontSize(10).fillColor(C.ink).text(item.name, left + 8, y, { width: width * 0.6 });
    const condColor = item.condition === "GOOD" ? C.accent : item.condition === "WORN" ? C.muted : "#b0261d";
    doc.font("mono-medium").fontSize(8).fillColor(condColor).text(CONDITION[item.condition]!.toUpperCase(), left + width * 0.65, y + 1, { width: width * 0.35, align: "right", characterSpacing: 0.5 });
    if (item.note) doc.font("sans").fontSize(9).fillColor(C.muted).text(item.note, left + 8, doc.y, { width: width - 16 });

    // Photos (JPEG/PNG – the formats PDF can embed), up to 3 per item.
    const photos = item.attachments.filter((a) => a.mimeType === "image/jpeg" || a.mimeType === "image/png").slice(0, 3);
    if (photos.length) {
      ensure(110);
      const top = doc.y + 4;
      let x = left + 8;
      for (const p of photos) {
        const key = keys.get(p.id);
        const img = key ? await readImage(storage, key) : null;
        if (img) {
          try {
            doc.image(img, x, top, { fit: [130, 96] });
            doc.rect(x, top, 130, 96).lineWidth(0.5).strokeColor(C.line).stroke();
          } catch {
            /* unreadable image – skip */
          }
        }
        x += 140;
      }
      doc.y = top + 104;
    }
    doc.moveDown(0.4);
  }
  if (h.items.length === 0) doc.font("sans").fontSize(10).fillColor(C.muted).text("Ni vpisanih prostorov in opreme.");

  // ---- Notes ----
  if (h.notes) {
    section("05", "Opombe");
    doc.font("sans").fontSize(10).fillColor(C.ink).text(h.notes, { width });
  }

  // ---- Confirmations ----
  section(h.notes ? "06" : "05", "Potrditev");
  const confirmLine = (who: string, at: Date | null, by?: string | null) => {
    doc.font("sans-semibold").fontSize(10).fillColor(C.ink).text(who);
    doc.font("mono").fontSize(9).fillColor(at ? C.accent : C.faint).text(at ? `Potrjeno ${stamp(at)}${by ? `, ${by}` : ""}` : "Čaka potrditev");
    doc.moveDown(0.6);
  };
  confirmLine("Najemodajalec", h.landlordConfirmedAt, property.owner.name ?? property.owner.email);
  confirmLine(h.tenancy.members.length > 1 ? "Najemniki" : "Najemnik", h.tenantConfirmedAt, h.tenantConfirmedBy?.name ?? h.tenantConfirmedBy?.email ?? null);
  doc.font("sans").fontSize(8).fillColor(C.faint).text("Potrditvi sta bili dani v aplikaciji Kvito po prijavi z enkratno kodo. Zapisnik ne nadomešča pogodbe.", { width });

  // ---- Footer with page numbers ----
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing inside the bottom margin would otherwise make pdfkit start a new page.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 40;
    doc.moveTo(left, y - 8).lineTo(left + width, y - 8).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.font("mono").fontSize(7.5).fillColor(C.faint);
    doc.text(`KVITO  ZAPISNIK O PRIMOPREDAJI — ${kind.toUpperCase()}`, left, y, { width: width * 0.7, lineBreak: false, characterSpacing: 0.5 });
    doc.text(`${i + 1} / ${range.count}`, left + width * 0.7, y, { width: width * 0.3, align: "right", lineBreak: false });
    doc.page.margins.bottom = bottom;
  }

  doc.end();
  return done;
}
