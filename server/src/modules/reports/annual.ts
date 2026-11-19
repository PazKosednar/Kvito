import PDFDocument from "pdfkit";
import { addTo, emptyMonths, splitReceived, sumMonths, type MoneyKind, type MonthTotals } from "../../lib/annual.js";
import { C, drawLogo, registerFonts } from "../../lib/pdf.js";
import { prisma } from "../../lib/prisma.js";

export interface AnnualUnit {
  tenancyId: string;
  propertyId: string;
  property: string;
  unit: string;
  tenants: string[];
  months: MonthTotals[];
  totals: Record<MoneyKind, number>;
  /** Paid back by the landlord in the year (outside Kvito, recorded in it). */
  returned: { depositCents: number; costsCents: number };
}

export interface AnnualSummary {
  year: number;
  units: AnnualUnit[];
  totals: Record<MoneyKind, number>;
  returned: { depositCents: number; costsCents: number };
}

const yearOf = (d: Date) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Ljubljana", year: "numeric" }).format(d));
const monthOf = (d: Date) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Ljubljana", month: "numeric" }).format(d));

/**
 * Money a landlord received in a calendar year, by unit and month, split into rent, costs, deposit and other.
 * The month is the payment date the tenant reported (or the landlord's confirmation when there is none).
 * TODO(preveri): payment date vs. confirmation date vs. due date for the tax year.
 */
export async function loadAnnualSummary(landlordId: string, year: number): Promise<AnnualSummary> {
  // Candidates: paid in the year, or confirmed around it (no paid-on date); the year is then decided per payment.
  const from = new Date(Date.UTC(year - 1, 11, 1));
  const to = new Date(Date.UTC(year + 1, 1, 1));
  const owned = { unit: { property: { ownerId: landlordId } } };
  const [shares, deposits, refunds, tenancies] = await Promise.all([
    prisma.chargeShare.findMany({
      where: {
        deletedAt: null,
        status: "CONFIRMED",
        charge: { deletedAt: null, tenancy: owned },
        OR: [
          { confirmedAt: { gte: from, lt: to } },
          { paymentReports: { some: { status: "ACCEPTED", deletedAt: null, paidOn: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } } } },
        ],
      },
      select: {
        amountCents: true,
        confirmedAt: true,
        paymentReports: { where: { status: "ACCEPTED", deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1, select: { paidOn: true } },
        charge: { select: { tenancyId: true, type: true, amountCents: true, lines: { select: { costType: true, amountCents: true, creditSettlementId: true } } } },
      },
    }),
    // Deposits received before Kvito have no charge; returned deposits are money going back.
    prisma.deposit.findMany({ where: { tenancy: owned }, select: { tenancyId: true, amountCents: true, chargeId: true, receivedOn: true, returnedOn: true, returnCents: true } }),
    prisma.costSettlement.findMany({ where: { deletedAt: null, tenancy: owned, refundedOn: { not: null }, refundedCents: { gt: 0 } }, select: { tenancyId: true, refundedOn: true, refundedCents: true } }),
    prisma.tenancy.findMany({
      where: { deletedAt: null, ...owned },
      select: { id: true, unit: { select: { name: true, property: { select: { id: true, name: true } } } }, members: { where: { deletedAt: null }, select: { user: { select: { name: true, email: true } } } } },
    }),
  ]);

  const units = new Map<string, AnnualUnit>();
  const unitOf = (tenancyId: string) => {
    let u = units.get(tenancyId);
    if (!u) {
      const t = tenancies.find((x) => x.id === tenancyId)!;
      u = {
        tenancyId,
        propertyId: t.unit.property.id,
        property: t.unit.property.name,
        unit: t.unit.name,
        tenants: t.members.map((m) => m.user.name ?? m.user.email),
        months: emptyMonths(),
        totals: { rent: 0, costs: 0, deposit: 0, other: 0 },
        returned: { depositCents: 0, costsCents: 0 },
      };
      units.set(tenancyId, u);
    }
    return u;
  };

  for (const s of shares) {
    const paid = s.paymentReports[0]?.paidOn ?? s.confirmedAt!;
    if (yearOf(paid) !== year || !tenancies.some((t) => t.id === s.charge.tenancyId)) continue;
    addTo(unitOf(s.charge.tenancyId).months, monthOf(paid), splitReceived({ amountCents: s.amountCents, charge: s.charge }));
  }
  for (const d of deposits) {
    if (!tenancies.some((t) => t.id === d.tenancyId)) continue;
    if (!d.chargeId && d.receivedOn && yearOf(d.receivedOn) === year) addTo(unitOf(d.tenancyId).months, monthOf(d.receivedOn), { rent: 0, costs: 0, deposit: d.amountCents, other: 0 });
    if (d.returnedOn && d.returnCents && yearOf(d.returnedOn) === year) unitOf(d.tenancyId).returned.depositCents += d.returnCents;
  }
  for (const r of refunds) {
    if (!tenancies.some((t) => t.id === r.tenancyId) || yearOf(r.refundedOn!) !== year) continue;
    unitOf(r.tenancyId).returned.costsCents += r.refundedCents!;
  }

  const list = [...units.values()].sort((a, b) => `${a.property} ${a.unit}`.localeCompare(`${b.property} ${b.unit}`, "sl"));
  for (const u of list) u.totals = sumMonths(u.months);
  const totals = list.reduce(
    (t, u) => ({ rent: t.rent + u.totals.rent, costs: t.costs + u.totals.costs, deposit: t.deposit + u.totals.deposit, other: t.other + u.totals.other }),
    { rent: 0, costs: 0, deposit: 0, other: 0 },
  );
  const returned = list.reduce((t, u) => ({ depositCents: t.depositCents + u.returned.depositCents, costsCents: t.costsCents + u.returned.costsCents }), { depositCents: 0, costsCents: 0 });
  return { year, units: list, totals, returned };
}

// ---------- CSV ----------

const MONTHS = ["januar", "februar", "marec", "april", "maj", "junij", "julij", "avgust", "september", "oktober", "november", "december"];
const sheetMoney = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const csvCell = (v: string) => (/[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** One row per unit and month with money; UTF-8 with BOM and ";" for Slovenian Excel. */
export function annualCsv(s: AnnualSummary): Buffer {
  const header = ["Leto", "Mesec", "Nepremičnina", "Enota", "Najemnina (EUR)", "Povrnjeni stroški (EUR)", "Varščina (EUR)", "Drugo (EUR)"];
  const rows: string[] = [];
  for (const u of s.units) {
    for (const m of u.months) {
      if (!m.rent && !m.costs && !m.deposit && !m.other) continue;
      rows.push([String(s.year), MONTHS[m.month - 1]!, u.property, u.unit, sheetMoney(m.rent), sheetMoney(m.costs), sheetMoney(m.deposit), sheetMoney(m.other)].map(csvCell).join(";"));
    }
  }
  rows.push(["Skupaj", "", "", "", sheetMoney(s.totals.rent), sheetMoney(s.totals.costs), sheetMoney(s.totals.deposit), sheetMoney(s.totals.other)].join(";"));
  rows.push(["Vrnjeno", "", "", "", "", sheetMoney(-s.returned.costsCents), sheetMoney(-s.returned.depositCents), ""].join(";"));
  return Buffer.from(`﻿${[header.join(";"), ...rows].join("\r\n")}\r\n`, "utf8");
}

// ---------- PDF ----------

const money = (cents: number) => new Intl.NumberFormat("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" }).format(cents / 100);
const dayLocal = (d: Date) => new Intl.DateTimeFormat("sl-SI", { timeZone: "Europe/Ljubljana" }).format(d);

export async function renderAnnualPdf(s: AnnualSummary, landlord: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 48, bottom: 56, left: 44, right: 44 }, bufferPages: true, info: { Title: `Letni povzetek ${s.year}`, Author: "Kvito" } });
  registerFonts(doc);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;

  const table = (cols: { label: string; w: number; right?: boolean }[], rows: string[][], boldLast = false) => {
    const xs = cols.reduce<number[]>((acc, c, i) => [...acc, i === 0 ? left : acc[i - 1]! + cols[i - 1]!.w * width], []);
    let y = doc.y;
    cols.forEach((c, i) => doc.font("mono-medium").fontSize(7).fillColor(C.faint).text(c.label, xs[i]!, y, { width: c.w * width - 6, align: c.right ? "right" : "left", characterSpacing: 0.4, lineBreak: false }));
    y += 13;
    doc.moveTo(left, y - 3).lineTo(left + width, y - 3).lineWidth(0.5).strokeColor(C.line).stroke();
    rows.forEach((r, ri) => {
      if (y > doc.page.height - doc.page.margins.bottom - 24) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      const bold = boldLast && ri === rows.length - 1;
      if (bold) doc.moveTo(left, y - 2).lineTo(left + width, y - 2).lineWidth(0.8).strokeColor(C.ink).stroke();
      r.forEach((text, i) =>
        doc
          .font(cols[i]!.right ? (bold ? "mono-medium" : "mono") : bold ? "sans-semibold" : "sans")
          .fontSize(8.5)
          .fillColor(C.ink)
          .text(text, xs[i]!, y + (bold ? 2 : 0), { width: cols[i]!.w * width - 6, align: cols[i]!.right ? "right" : "left", lineBreak: false, ellipsis: true }),
      );
      y += 15;
    });
    doc.y = y + 8;
  };

  drawLogo(doc, left, 40, 18);
  doc.font("mono").fontSize(8).fillColor(C.faint).text(`Ustvarjeno ${dayLocal(new Date())}`, left, 44, { width, align: "right" });
  doc.y = 80;
  doc.font("mono-medium").fontSize(8).fillColor(C.faint).text("LETNI POVZETEK PREJETEGA DENARJA", left, doc.y, { characterSpacing: 1 });
  doc.font("sans-semibold").fontSize(22).fillColor(C.ink).text(`Leto ${s.year}`, left, doc.y + 4);
  doc.font("sans").fontSize(10).fillColor(C.muted).text(`Najemodajalec: ${landlord}`);
  doc.moveDown(1);

  doc.font("sans-semibold").fontSize(11).fillColor(C.ink).text("Po enotah", left, doc.y);
  doc.moveDown(0.4);
  const unitCols = [
    { label: "ENOTA", w: 0.32 },
    { label: "NAJEMNINA", w: 0.17, right: true },
    { label: "STROŠKI", w: 0.17, right: true },
    { label: "VARŠČINA", w: 0.17, right: true },
    { label: "DRUGO", w: 0.17, right: true },
  ];
  table(unitCols, [
    ...s.units.map((u) => [`${u.property} / ${u.unit}`, money(u.totals.rent), money(u.totals.costs), money(u.totals.deposit), money(u.totals.other)]),
    ["Skupaj", money(s.totals.rent), money(s.totals.costs), money(s.totals.deposit), money(s.totals.other)],
  ], true);

  doc.font("sans-semibold").fontSize(11).fillColor(C.ink).text("Po mesecih (vse enote)", left, doc.y);
  doc.moveDown(0.4);
  const all = emptyMonths();
  for (const u of s.units) for (const m of u.months) addTo(all, m.month, m);
  table(
    [
      { label: "MESEC", w: 0.32 },
      { label: "NAJEMNINA", w: 0.17, right: true },
      { label: "STROŠKI", w: 0.17, right: true },
      { label: "VARŠČINA", w: 0.17, right: true },
      { label: "DRUGO", w: 0.17, right: true },
    ],
    all.map((m) => [MONTHS[m.month - 1]!, money(m.rent), money(m.costs), money(m.deposit), money(m.other)]),
  );

  if (s.returned.depositCents || s.returned.costsCents) {
    doc.font("sans-semibold").fontSize(11).fillColor(C.ink).text("Vrnjeno najemnikom", left, doc.y);
    doc.font("sans").fontSize(9.5).fillColor(C.ink).text(`Varščina: ${money(s.returned.depositCents)} €   ·   Preplačila stroškov: ${money(s.returned.costsCents)} €`, left, doc.y + 4);
    doc.moveDown(1);
  }

  doc.moveDown(0.5);
  doc
    .font("sans")
    .fontSize(8)
    .fillColor(C.faint)
    .text(
      "Zneski so plačila, ki jih je najemodajalec potrdil v aplikaciji Kvito, razvrščena po datumu plačila. »Stroški« so povrnjeni obratovalni stroški (akontacije, pavšal, poračuni, računi). Kvito denarja ne prejema in ne posreduje. Dokument je pomoč pri evidenci, ne davčni obračun ali nasvet – kaj se šteje v dohodek, preveri pri računovodji ali FURS.",
      left,
      doc.y,
      { width },
    );

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 30;
    doc.font("mono").fontSize(7.5).fillColor(C.faint);
    doc.text(`KVITO  LETNI POVZETEK ${s.year}`, left, y, { width: width * 0.7, lineBreak: false, characterSpacing: 0.5 });
    doc.text(`${i + 1} / ${range.count}`, left + width * 0.7, y, { width: width * 0.3, align: "right", lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return done;
}
