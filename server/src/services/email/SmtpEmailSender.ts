import nodemailer, { type Transporter } from "nodemailer";
import type { EmailMessage, EmailSender } from "./EmailSender.js";

export interface SmtpConfig {
  host: string;
  port: number;
  /** true = TLS from the start (port 465); false = STARTTLS when the server offers it (port 587). */
  secure: boolean;
  user?: string | undefined;
  pass?: string | undefined;
  from: string;
}

/** Sends e-mail through any SMTP provider, so the EU provider can be chosen (and changed) without code changes. */
export class SmtpEmailSender implements EmailSender {
  private readonly transport: Transporter;

  constructor(
    private readonly config: SmtpConfig,
    transport?: Transporter,
  ) {
    this.transport =
      transport ??
      nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        requireTLS: !config.secure,
        ...(config.user ? { auth: { user: config.user, pass: config.pass ?? "" } } : {}),
      });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
        ...(a.cid ? { cid: a.cid } : {}),
      })),
    });
  }
}
