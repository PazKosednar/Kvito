import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createApp } from "./app.js";
import { env, isProd } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { createEmailSender } from "./services/email/createEmailSender.js";
import { attachNotificationListeners } from "./services/notifications/listeners.js";
import { createNotifier } from "./services/notifications/notifier.js";
import { NullPushSender, WebPushSender } from "./services/push/WebPushSender.js";
import { sendPaymentReminders, sendWeeklySummaries } from "./services/jobs/reminders.js";
import { purgeExpiredData } from "./services/jobs/retention.js";
import { attachRealtime } from "./services/realtime.js";
import { sendContractReminders } from "./services/jobs/contract.js";
import { generateMonthlyAdvances, generateMonthlyRent, markOverdue } from "./services/jobs/rent.js";
import { startScheduler } from "./services/jobs/scheduler.js";
import { createStorage } from "./services/storage/createStorage.js";

async function main() {
  const uploadDir = path.resolve(env.UPLOAD_DIR);
  if (!isProd || env.STORAGE_DRIVER === "local") await mkdir(uploadDir, { recursive: true });

  // TODO(preveri): choose the production SMTP provider (EU); until SMTP_HOST is set, e-mails are only printed.
  const emailSender = createEmailSender();
  const storage = createStorage(uploadDir);
  const pushSender =
    env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
      ? new WebPushSender(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT)
      : new NullPushSender();
  if (!pushSender.publicKey) logger.warn("VAPID ključi niso nastavljeni – push je izklopljen, obvestila gredo po e-pošti (npm run vapid -w server).");
  const notifier = createNotifier({ emailSender, pushSender });
  const detachListeners = attachNotificationListeners(notifier);
  const app = createApp({ emailSender, storage, pushPublicKey: pushSender.publicKey });

  const server = app.listen(env.PORT, () => {
    logger.info(`Kvito API posluša na http://localhost:${env.PORT} (uploads: ${uploadDir})`);
  });
  const io = attachRealtime(server);
  server.on("error", (err: NodeJS.ErrnoException) => {
    // console.error is synchronous, so the message is visible even though we exit immediately.
    console.error(
      err.code === "EADDRINUSE"
        ? `Vrata ${env.PORT} so že zasedena – je Kvito API morda že zagnan v drugem oknu?`
        : `Strežnika ni bilo mogoče zagnati: ${err.message}`,
    );
    process.exit(1);
  });

  const stopJobs = startScheduler([
    { name: "monthly-rent", run: generateMonthlyRent },
    { name: "monthly-advances", run: generateMonthlyAdvances },
    { name: "mark-overdue", run: markOverdue },
    { name: "payment-reminders", run: (now) => sendPaymentReminders(notifier, now) },
    { name: "weekly-summary", run: (now) => sendWeeklySummaries(notifier, now) },
    { name: "contract-reminders", run: (now) => sendContractReminders(notifier, now) },
    { name: "retention", run: purgeExpiredData },
  ]);

  const shutdown = (signal: string) => {
    logger.info(`${signal} – zapiram strežnik`);
    stopJobs();
    detachListeners();
    void io.close();
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  console.error("Server failed to start:", err);
  process.exit(1);
});
