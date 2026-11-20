import { addDays, toDateOnly, todayInLjubljana } from "../../lib/dates.js";
import { prisma } from "../../lib/prisma.js";

export type CalendarEventType = "CHARGE_DUE" | "LEASE_END" | "RENT_REVIEW" | "RENT_CHANGE" | "ENERGY_CERT";

export interface CalendarEvent {
  /** Stable across calls (also the iCal UID). */
  id: string;
  type: CalendarEventType;
  /** YYYY-MM-DD, all-day. */
  date: string;
  title: string;
  /** "Hiša na Trnovem / Stanovanje B" */
  place: string;
  tenancyId: string | null;
  unitId: string;
  amountCents: number | null;
  /** Charge past its due date and not settled. */
  overdue: boolean;
}

const MONTHS = ["januar", "februar", "marec", "april", "maj", "junij", "julij", "avgust", "september", "oktober", "november", "december"];

/**
 * Dates a landlord should not miss, from the data already in Kvito: open obligations, the end of tenancies,
 * the yearly rent review month from the contract, scheduled rent changes and energy certificates expiring.
 * Titles are in Slovenian (also used in the .ics feed).
 */
export async function landlordEvents(ownerId: string, from: Date, to: Date): Promise<CalendarEvent[]> {
  const owned = { deletedAt: null, property: { ownerId, deletedAt: null } };
  const live = { deletedAt: null, status: { in: ["DRAFT" as const, "ACTIVE" as const] }, unit: owned };
  const placeOf = (u: { name: string; property: { name: string } }) => `${u.property.name} / ${u.name}`;
  const unitSelect = { id: true, name: true, property: { select: { name: true } } } as const;
  const today = todayInLjubljana();

  const [charges, tenancies, changes, units] = await Promise.all([
    prisma.charge.findMany({
      // Still to be paid; "reported paid" waits for the landlord in the obligations list, not here.
      where: { deletedAt: null, status: { in: ["OPEN", "OVERDUE", "DISPUTED"] }, dueDate: { gte: from, lte: to }, tenancy: live },
      select: { id: true, title: true, amountCents: true, dueDate: true, status: true, tenancyId: true, tenancy: { select: { unit: { select: unitSelect } } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.tenancy.findMany({
      where: live,
      select: { id: true, endDate: true, rentReviewMonth: true, unit: { select: unitSelect } },
    }),
    prisma.rentChange.findMany({
      where: { deletedAt: null, appliedAt: null, effectiveFrom: { gte: from, lte: to }, tenancy: live },
      select: { id: true, effectiveFrom: true, rentCents: true, tenancyId: true, tenancy: { select: { unit: { select: unitSelect } } } },
    }),
    prisma.unit.findMany({
      where: { ...owned, energyCertValidUntil: { gte: from, lte: to } },
      select: { ...unitSelect, energyCertValidUntil: true },
    }),
  ]);

  const events: CalendarEvent[] = [];
  for (const c of charges) {
    events.push({
      id: `charge-${c.id}`,
      type: "CHARGE_DUE",
      date: toDateOnly(c.dueDate),
      title: `Rok: ${c.title}`,
      place: placeOf(c.tenancy.unit),
      tenancyId: c.tenancyId,
      unitId: c.tenancy.unit.id,
      amountCents: c.amountCents,
      overdue: c.status === "OVERDUE" || (c.dueDate < today && c.status === "OPEN"),
    });
  }
  for (const t of tenancies) {
    const base = { tenancyId: t.id, unitId: t.unit.id, place: placeOf(t.unit), amountCents: null, overdue: false };
    if (t.endDate && t.endDate >= from && t.endDate <= to) {
      events.push({ ...base, id: `end-${t.id}`, type: "LEASE_END", date: toDateOnly(t.endDate), title: "Konec najema" });
    }
    if (t.rentReviewMonth) {
      // The first day of the review month in every year of the range.
      for (let y = from.getUTCFullYear(); y <= to.getUTCFullYear(); y++) {
        const d = new Date(Date.UTC(y, t.rentReviewMonth - 1, 1));
        if (d < from || d > to || (t.endDate && d > t.endDate)) continue;
        events.push({ ...base, id: `review-${t.id}-${y}`, type: "RENT_REVIEW", date: toDateOnly(d), title: `Letni pregled najemnine (${MONTHS[t.rentReviewMonth - 1]})` });
      }
    }
  }
  for (const r of changes) {
    events.push({
      id: `rent-${r.id}`,
      type: "RENT_CHANGE",
      date: toDateOnly(r.effectiveFrom),
      title: "Nova najemnina začne veljati",
      place: placeOf(r.tenancy.unit),
      tenancyId: r.tenancyId,
      unitId: r.tenancy.unit.id,
      amountCents: r.rentCents,
      overdue: false,
    });
  }
  for (const u of units) {
    events.push({
      id: `energy-${u.id}`,
      type: "ENERGY_CERT",
      date: toDateOnly(u.energyCertValidUntil!),
      title: "Energetska izkaznica poteče",
      place: placeOf(u),
      tenancyId: null,
      unitId: u.id,
      amountCents: null,
      overdue: false,
    });
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type) || a.place.localeCompare(b.place));
}

/** Default window: overdue things from the last 90 days, and a year ahead. */
export function defaultWindow(now = todayInLjubljana()) {
  return { from: addDays(now, -90), to: addDays(now, 366) };
}

// ---------- iCalendar (RFC 5545) ----------

const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsDate = (iso: string) => iso.replace(/-/g, "");

/** Lines longer than 75 octets are folded (continuation lines start with a space). */
function fold(line: string): string {
  const out: string[] = [];
  let current = "";
  for (const ch of line) {
    if (Buffer.byteLength(current + ch, "utf8") > 74) {
      out.push(current);
      current = " " + ch;
    } else current += ch;
  }
  out.push(current);
  return out.join("\r\n");
}

const euro = (cents: number) => `${(cents / 100).toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export function toIcs(events: CalendarEvent[], appUrl: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kvito//Koledar rokov//SL", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Kvito – roki", "X-WR-TIMEZONE:Europe/Ljubljana"];
  for (const e of events) {
    const next = new Date(`${e.date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const summary = `${e.title}${e.amountCents !== null ? ` – ${euro(e.amountCents)}` : ""} · ${e.place}`;
    const link = e.tenancyId ? `${appUrl}/najemi/${e.tenancyId}` : `${appUrl}/enote/${e.unitId}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@kvito`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(e.date)}`,
      `DTEND;VALUE=DATE:${icsDate(next.toISOString().slice(0, 10))}`,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(`Odpri v Kvitu: ${link}`)}`,
      `URL:${link}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
