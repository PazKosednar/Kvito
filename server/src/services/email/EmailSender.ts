export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
  /** Set to reference the attachment from HTML as <img src="cid:…">. */
  cid?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: EmailAttachment[];
}

/** Transport-agnostic e-mail sending; a real provider (EU) is plugged in before production. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
