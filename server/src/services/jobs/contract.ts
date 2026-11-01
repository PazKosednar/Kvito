import { N } from "../../i18n/notifications.js";
import { DISPLAY_TZ, toDateOnly, todayInLjubljana } from "../../lib/dates.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import type { Notifier } from "../notifications/notifier.js";

const MS_DAY = 86_400_000;
/** Days before the end of a fixed-term tenancy when both sides get a heads-up. Only the nearest one is sent. */
export const ENDING_REMINDER_DAYS = [90, 30, 7];
const FIRST_HOUR = 8;

const hourInLjubljana = (now: Date) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: DISPLAY_TZ, hour: "2-digit", hourCycle: "h23" }).format(now));

/**
 * Contract reminders, idempotent through dedupe keys:
 *  - a fixed-term tenancy ends in 90 / 30 / 7 days → landlord and tenants,
 *  - it has ended but is still active in Kvito → landlord, once per end date,
 *  - the month the landlord chose for the yearly rent review → landlord, once per year.
 */
export async function sendContractReminders(notifier: Notifier, now = new Date()): Promise<number> {
  if (hourInLjubljana(now) < FIRST_HOUR) return 0;
  const today = todayInLjubljana(now);
  const month = today.getUTCMonth() + 1;
  const year = today.getUTCFullYear();

  const tenancies = await prisma.tenancy.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      unit: { deletedAt: null, property: { deletedAt: null } },
      OR: [{ endDate: { not: null } }, { rentReviewMonth: month }],
    },
    select: {
      id: true,
      endDate: true,
      noticePeriodDays: true,
      rentReviewMonth: true,
      unit: { select: { name: true, property: { select: { ownerId: true } } } },
      members: { where: { deletedAt: null, leftAt: null }, select: { userId: true } },
    },
    take: 5000,
  });

  let sent = 0;
  const send = async (userId: string, type: string, text: ReturnType<typeof N.rentReview>, url: string, dedupeKey: string) => {
    if (await notifier.notify({ userId, type, text, url, dedupeKey, email: "fallback" })) sent++;
  };

  for (const t of tenancies) {
    const landlordId = t.unit.property.ownerId;
    const contractUrl = `/najemi/${t.id}/pogodba`;

    if (t.endDate) {
      const days = Math.round((t.endDate.getTime() - today.getTime()) / MS_DAY);
      const end = toDateOnly(t.endDate);
      if (days < 0) {
        await send(landlordId, "contract.expired", N.contractExpired(t.unit.name, t.endDate), contractUrl, `contract.expired:${t.id}:${end}`);
      } else {
        const threshold = [...ENDING_REMINDER_DAYS].sort((a, b) => a - b).find((d) => days <= d);
        if (threshold !== undefined) {
          const text = N.contractEnding(t.unit.name, t.endDate, days, t.noticePeriodDays);
          for (const userId of new Set([landlordId, ...t.members.map((m) => m.userId)])) {
            await send(userId, "contract.ending", text, contractUrl, `contract.ending:${t.id}:${end}:${threshold}:${userId}`);
          }
        }
      }
    }

    if (t.rentReviewMonth === month) {
      await send(landlordId, "rent.review", N.rentReview(t.unit.name), contractUrl, `rent.review:${t.id}:${year}`);
    }
  }
  if (sent) logger.info(`Opomniki za pogodbe: poslanih ${sent}`);
  return sent;
}
