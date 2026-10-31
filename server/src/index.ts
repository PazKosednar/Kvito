import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { ConsoleEmailSender } from "./services/email/ConsoleEmailSender.js";
import { generateMonthlyRent, markOverdue } from "./services/jobs/rent.js";
import { startScheduler } from "./services/jobs/scheduler.js";
import { LocalDiskStorage } from "./services/storage/Storage.js";

async function main() {
  const uploadDir = path.resolve(env.UPLOAD_DIR);
  await mkdir(uploadDir, { recursive: true });

  // TODO(preveri): production e-mail provider (EU) – until then e-mails are only printed.
  const emailSender = new ConsoleEmailSender();
  // TODO(faza 5): S3-compatible EU storage in production.
  const storage = new LocalDiskStorage(uploadDir);
  const app = createApp({ emailSender, storage });

  const server = app.listen(env.PORT, () => {
    logger.info(`Kvita API posluša na http://localhost:${env.PORT} (uploads: ${uploadDir})`);
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    // console.error is synchronous, so the message is visible even though we exit immediately.
    console.error(
      err.code === "EADDRINUSE"
        ? `Vrata ${env.PORT} so že zasedena – je Kvita API morda že zagnan v drugem oknu?`
        : `Strežnika ni bilo mogoče zagnati: ${err.message}`,
    );
    process.exit(1);
  });

  const stopJobs = startScheduler([
    { name: "monthly-rent", run: generateMonthlyRent },
    { name: "mark-overdue", run: markOverdue },
  ]);

  const shutdown = (signal: string) => {
    logger.info(`${signal} – zapiram strežnik`);
    stopJobs();
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
