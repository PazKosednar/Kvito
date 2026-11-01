import { N } from "../../i18n/notifications.js";
import { DISPLAY_TZ, addDays, toDateOnly, todayInLjubljana } from "../../lib/dates.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import type { Notifier } from "../notifications/notifier.js";

const MS_DAY = 86_400_000;
/** Overdue reminders: the day after the due date, then weekly – 4 in total, so nobody is nagged forever. */
const OVERDUE_REMINDERS = 4;
/** Reminders go out in the morning, not at 00:15 when the server happens to tick. */
const FIRST_HOUR = 8;

const hourInLjubljana = (now: Date) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: DISPLAY_TZ, hour: "2-digit", hourCycle: "h23" }).format(now));

const isMondayInLjubljana = (now: Date) => todayInLjubljana(now).getUTCDay() === 1;

/**
 * Reminders for unpaid shares: 3 days before the due date, on the due date, and after it passed.
 * Idempotent – every reminder has a dedupe key, so running this every 15 minutes sends each one once.
 */
export async function sendPaymentReminders(notifier: Notifier, now = new Date()): Promise<number> {
  if (hourInLjubljana(now) < FIRST_HOUR) return 0;
  const today = todayInLjubljana(now);

  const shares = await prisma.chargeShare.findMany({
    where: {
      deletedAt: null,
      status: { in: ["OPEN", "OVERDUE"] },
      charge: { deletedAt: null, dueDate: { lte: addDays(today, 3) } },
      member: { deletedAt: null, leftAt: null },
    },
    select: {
      id: true,
      amountCents: true,
      member: { select: { userId: true } },
      charge: { select: { id: true, tenancyId: true, type: true, title: true, rentPeriod: true, autoKey: true, dueDate: true } },
    },
    take: 2000,
  });

  let sent = 0;
  for (const s of shares) {
    const days = Math.round((s.charge.dueDate.getTime() - today.getTime()) / MS_DAY);
    const userId = s.member.userId;
    const url = `/najemi/${s.charge.tenancyId}/obveznosti/${s.charge.id}`;

    let n: { type: string; text: ReturnType<typeof N.reminderToday>; key: string } | null = null;
    if (days < 0) {
      const week = Math.floor((-days - 1) / 7);
      if (week < OVERDUE_REMINDERS) {
        n = { type: "reminder.overdue", text: N.reminderOverdue(s.charge, s.amountCents, s.charge.dueDate), key: `overdue:${s.id}:${week}` };
      }
    } else if (days === 0) {
      n = { type: "reminder.today", text: N.reminderToday(s.charge, s.amountCents), key: `today:${s.id}` };
    } else {
      n = { type: "reminder.upcoming", text: N.reminderUpcoming(s.charge, s.amountCents, days), key: `upcoming:${s.id}` };
    }
    if (!n) continue;
    if (await notifier.notify({ userId, type: n.type, text: n.text, url, dedupeKey: n.key, email: "fallback" })) sent++;
  }
  if (sent) logger.info(`Opomniki: poslanih ${sent}`);
  return sent;
}

/** Monday summary for landlords: what is overdue, what waits for confirmation, what falls due this week. */
export async function sendWeeklySummaries(notifier: Notifier, now = new Date()): Promise<number> {
  if (!isMondayInLjubljana(now) || hourInLjubljana(now) < FIRST_HOUR) return 0;
  const today = todayInLjubljana(now);
  const week = toDateOnly(today);

  const shares = await prisma.chargeShare.findMany({
    where: {
      deletedAt: null,
      status: { in: ["OPEN", "OVERDUE", "REPORTED_PAID"] },
      charge: { deletedAt: null, dueDate: { lte: addDays(today, 7) }, tenancy: { deletedAt: null, unit: { deletedAt: null, property: { deletedAt: null } } } },
    },
    select: {
      status: true,
      amountCents: true,
      charge: { select: { tenancy: { select: { unit: { select: { property: { select: { ownerId: true } } } } } } } },
    },
    take: 5000,
  });

  const byLandlord = new Map<string, { overdue: number; overdueCents: number; waiting: number; soon: number }>();
  for (const s of shares) {
    const id = s.charge.tenancy.unit.property.ownerId;
    const row = byLandlord.get(id) ?? { overdue: 0, overdueCents: 0, waiting: 0, soon: 0 };
    if (s.status === "OVERDUE") {
      row.overdue++;
      row.overdueCents += s.amountCents;
    } else if (s.status === "REPORTED_PAID") row.waiting++;
    else row.soon++;
    byLandlord.set(id, row);
  }

  let sent = 0;
  for (const [userId, r] of byLandlord) {
    if (!r.overdue && !r.waiting && !r.soon) continue;
    const ok = await notifier.notify({
      userId,
      type: "summary.weekly",
      text: N.weeklySummary(r),
      url: "/",
      dedupeKey: `weekly:${userId}:${week}`,
      email: "fallback",
    });
    if (ok) sent++;
  }
  return sent;
}
