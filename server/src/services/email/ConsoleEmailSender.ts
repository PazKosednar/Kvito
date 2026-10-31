import { logger } from "../../lib/logger.js";
import type { EmailMessage, EmailSender } from "./EmailSender.js";

/** Development transport: prints e-mails to the server console instead of sending them. */
export class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    logger.info({ to: message.to, subject: message.subject }, "E-mail (dev, not sent)");
    const files = message.attachments?.length
      ? `\nPriponke: ${message.attachments.map((a) => `${a.filename} (${a.content.length} B)`).join(", ")}`
      : "";
    console.log(`\n────────── E-mail za ${message.to} ──────────\n${message.text}${files}\n──────────────────────────────────────────\n`);
  }
}
