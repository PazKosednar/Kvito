import { env, isProd } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { ConsoleEmailSender } from "./ConsoleEmailSender.js";
import type { EmailSender } from "./EmailSender.js";
import { SmtpEmailSender } from "./SmtpEmailSender.js";

/** SMTP when configured; the console otherwise. Production without SMTP would lock everyone out (login codes). */
export function createEmailSender(): EmailSender {
  if (env.SMTP_HOST) {
    logger.info(`E-pošta: SMTP ${env.SMTP_HOST}:${env.SMTP_PORT}`);
    return new SmtpEmailSender({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE, user: env.SMTP_USER, pass: env.SMTP_PASS, from: env.MAIL_FROM });
  }
  if (isProd && !env.EMAIL_CONSOLE_IN_PRODUCTION) {
    throw new Error("SMTP_HOST is required in production – login codes are sent by e-mail (see server/.env.example).");
  }
  if (isProd) logger.warn("EMAIL_CONSOLE_IN_PRODUCTION=true: e-pošta (tudi prijavne kode) gre samo v dnevnik strežnika. Samo za testiranje!");
  return new ConsoleEmailSender();
}
