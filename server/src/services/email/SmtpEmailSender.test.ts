import type { Transporter } from "nodemailer";
import { describe, expect, it } from "vitest";
import { SmtpEmailSender } from "./SmtpEmailSender.js";

describe("SmtpEmailSender", () => {
  it("hands text, html, sender and inline attachments to the transport", async () => {
    const sent: Record<string, unknown>[] = [];
    const transport = { sendMail: async (m: Record<string, unknown>) => void sent.push(m) } as unknown as Transporter;
    const mail = new SmtpEmailSender({ host: "smtp.example.test", port: 587, secure: false, from: "Kvito <obvestila@kvito.si>" }, transport);

    await mail.send({
      to: "ana@kvito.test",
      subject: "Predmet",
      text: "Besedilo",
      html: "<p>Besedilo</p>",
      attachments: [{ filename: "upn-qr.png", content: Buffer.from("x"), contentType: "image/png", cid: "upnqr" }],
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ from: "Kvito <obvestila@kvito.si>", to: "ana@kvito.test", subject: "Predmet", text: "Besedilo", html: "<p>Besedilo</p>" });
    expect(sent[0]?.["attachments"]).toEqual([{ filename: "upn-qr.png", content: Buffer.from("x"), contentType: "image/png", cid: "upnqr" }]);
  });
});
