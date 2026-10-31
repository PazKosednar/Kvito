export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Transport-agnostic e-mail sending; a real provider (EU) is plugged in before production. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
