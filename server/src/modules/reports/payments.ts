import PDFDocument from "pdfkit";
import { C, drawLogo, registerFonts } from "../../lib/pdf.js";
import { prisma } from "../../lib/prisma.js";

export interface PaymentRow {
  confirmedAt: Date;
  paidOn: Date | null;
  property: string;
  unit: string;
  tenant: string;
  title: string;
  costType: string | null;
  dueDate: Date;
  amountCents: number;
}

const COST_LABEL: Record<string, string> = {
  RENT: "Najemnina",
  ELECTRICITY: "Elektrika",
  WATER: "Voda",
  GAS: "Plin",
  HEATING: "Ogrevanje",
  WASTE: "Odpadki",
  INTERNET: "Internet",
  TV: "TV",
  MAINTENANCE_FUND: "Rezervni sklad",
  BUILDING_MANAGEMENT: "Upravnik",
  CLEANING: "Čiščenje",
  OTHER: "Drugo",
};

const dayUtc = (d: Date) => new Intl.DateTimeFormat("sl-SI", { timeZone: "UTC" }).format(d);
const dayLocal = (d: Date) => new Intl.DateTimeFormat("sl-SI", { timeZone: "Europe/Ljubljana" }).format(d);
const money = (cents: number) => new Intl.NumberFormat("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" }).format(cents / 100);
/** Plain decimal for spreadsheets: no thousands separator, comma as in Slovenian Excel. */
const sheetMoney = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/**
 * Payments the landlord confirmed in a calendar year (Europe/Ljubljana), ordered by date.
 * Only the landlord's own properties; only confirmed shares, so the list is what actually arrived.
 */
export async function loadPaymentRows(landlordId: string, year: number): Promise<PaymentRow[]> {
  // Ljubljana is UTC+1 on both 1 January boundaries.
  const from = new Date(Date.UTC(year, 0, 1) - 3_600_000);
  const to = new Date(Date.UTC(year + 1, 0, 1) - 3_600_000);
  const shares = await prisma.chargeShare.findMany({
    where: {
      deletedAt: null,
      status: "CONFIRMED",
      confirmedAt: { gte: from, lt: to },
      charge: { deletedAt: null, tenancy: { unit: { property: { ownerId: landlordId } } } },
    },
    orderBy: { confirmedAt: "asc" },
    select: {
      amountCents: true,
      confirmedAt: true,
      member: { select: { user: { select: { name: true, email: true } } } },
      paymentReports: { where: { status: "ACCEPTED", deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1, select: { paidOn: true } },
      charge: {
        select: {
          title: true,
          costType: true,
          dueDate: true,
          tenancy: { select: { unit: { select: { name: true, property: { select: { name: true } } } } } },
        },
      },
    },
  });
  return shares.map((s) => ({
    confirmedAt: s.confirmedAt!,
    paidOn: s.paymentReports[0]?.paidOn ?? null,
    property: s.charge.tenancy.unit.property.name,
    unit: s.charge.tenancy.unit.name,
    tenant: s.member.user.name ?? s.member.user.email,
    title: s.charge.title,
    costType: s.charge.costType,
    dueDate: s.charge.dueDate,
    amountCents: s.amountCents,
  }));
}

const csvCell = (v: string) => (/[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** UTF-8 with BOM and ";" so that Slovenian Excel opens it with correct characters and columns. */
export function paymentsCsv(rows: PaymentRow[]): Buffer {
  const header = ["Potrjeno", "Plačano", "Nepremičnina", "Enota", "Plačnik", "Obveznost", "Vrsta", "Rok", "Znesek (EUR)"];
  const lines = rows.map((r) =>
    [
      dayLocal(r.confirmedAt),
      r.paidOn ? dayUtc(r.paidOn) : "",
      r.property,
      r.unit,
      r.tenant,
      r.title,
      r.costType ? (COST_LABEL[r.costType] ?? r.costType) : "",
      dayUtc(r.dueDate),
      sheetMoney(r.amountCents),
    ]
      .map(csvCell)
      .join(";"),
  );
  const total = rows.reduce((s, r) => s + r.amountCents, 0);
  const sum = ["Skupaj", "", "", "", "", "", "", "", sheetMoney(total)].join(";");
  return Buffer.from(`﻿${[header.join(";"), ...lines, sum].join("\r\n")}\r\n`, "utf8");
}

export async function renderPaymentsPdf(rows: PaymentRow[], year: number, landlord: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margins: { top: 48, bottom: 56, left: 40, right: 40 }, bufferPages: true, info: { Title: `Prejeta plačila ${year}`, Author: "Kvito" } });
  registerFonts(doc);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const cols = [
    { label: "POTRJENO", w: 0.09 },
    { label: "NEPREMIČNINA / ENOTA", w: 0.2 },
    { label: "PLAČNIK", w: 0.18 },
    { label: "OBVEZNOST", w: 0.25 },
    { label: "VRSTA", w: 0.12 },
    { label: "ZNESEK", w: 0.16, right: true },
  ];
  const xs = cols.reduce<number[]>((acc, c, i) => [...acc, i === 0 ? left : acc[i - 1]! + cols[i - 1]!.w * width], []);

  const header = () => {
    const y = doc.y;
    cols.forEach((c, i) => doc.font("mono-medium").fontSize(7.5).fillColor(C.faint).text(c.label, xs[i]!, y, { width: c.w * width - 6, align: c.right ? "right" : "left", characterSpacing: 0.5, lineBreak: false }));
    doc.y = y + 14;
    doc.moveTo(left, doc.y - 3).lineTo(left + width, doc.y - 3).lineWidth(0.5).strokeColor(C.line).stroke();
  };

  drawLogo(doc, left, 40, 18);
  doc.font("mono").fontSize(8).fillColor(C.faint).text(`Ustvarjeno ${dayLocal(new Date())}`, left, 44, { width, align: "right" });
  doc.y = 80;
  doc.font("mono-medium").fontSize(8).fillColor(C.faint).text("PREJETA PLAČILA", left, doc.y, { characterSpacing: 1 });
  doc.font("sans-semibold").fontSize(22).fillColor(C.ink).text(`Leto ${year}`, left, doc.y + 4);
  doc.font("sans").fontSize(10).fillColor(C.muted).text(`Najemodajalec: ${landlord}`);
  doc.moveDown(1);
  header();

  for (const r of rows) {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 24) {
      doc.addPage();
      header();
    }
    const y = doc.y;
    const cells = [dayLocal(r.confirmedAt), `${r.property} / ${r.unit}`, r.tenant, r.title, r.costType ? (COST_LABEL[r.costType] ?? r.costType) : "", `${money(r.amountCents)} €`];
    cells.forEach((text, i) =>
      doc
        .font(i === 5 || i === 0 ? "mono" : "sans")
        .fontSize(8.5)
        .fillColor(C.ink)
        .text(text, xs[i]!, y, { width: cols[i]!.w * width - 6, align: cols[i]!.right ? "right" : "left", lineBreak: false, ellipsis: true }),
    );
    doc.y = y + 15;
  }
  if (rows.length === 0) doc.font("sans").fontSize(10).fillColor(C.muted).text("V tem letu ni potrjenih plačil.", left, doc.y);

  const total = rows.reduce((s, r) => s + r.amountCents, 0);
  if (doc.y > doc.page.height - doc.page.margins.bottom - 60) doc.addPage();
  doc.moveDown(0.5);
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(0.8).strokeColor(C.ink).stroke();
  doc.moveDown(0.5);
  doc.font("sans-semibold").fontSize(11).fillColor(C.ink).text(`Skupaj ${rows.length} plačil`, left, doc.y, { continued: false });
  doc.font("mono-medium").fontSize(13).fillColor(C.accent).text(`${money(total)} €`, left, doc.y - 14, { width, align: "right" });
  doc.moveDown(1.2);
  // TODO(preveri): which date (payment or confirmation) counts for tax purposes – ask an accountant.
  doc.font("sans").fontSize(8).fillColor(C.faint).text("Seznam vsebuje plačila, ki jih je najemodajalec potrdil v aplikaciji Kvito. Kvito denarja ne prejema in ne posreduje. Dokument je pomoč pri evidenci, ne davčni obračun.", left, doc.y, { width: width * 0.8 });

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 30;
    doc.font("mono").fontSize(7.5).fillColor(C.faint);
    doc.text(`KVITO  PREJETA PLAČILA ${year}`, left, y, { width: width * 0.7, lineBreak: false, characterSpacing: 0.5 });
    doc.text(`${i + 1} / ${range.count}`, left + width * 0.7, y, { width: width * 0.3, align: "right", lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return done;
}
