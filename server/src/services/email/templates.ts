import type { EmailMessage } from "./EmailSender.js";

// Brand colors mirror client/src/styles/tokens.css (e-mail clients do not support CSS variables).
const BRAND = { primary: "#4e40a0", text: "#1e1c2c", muted: "#63626e", bg: "#f9f7f4", card: "#ffffff", slip: "#fad1bb" };

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="sl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:${BRAND.bg};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${BRAND.text}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${BRAND.card};border-radius:16px;padding:28px">
        <tr><td style="font-size:22px;font-weight:700;color:${BRAND.primary};padding-bottom:16px">Kvita</td></tr>
        <tr><td style="font-size:16px;line-height:1.5">${bodyHtml}</td></tr>
        <tr><td style="font-size:13px;color:${BRAND.muted};padding-top:24px">Kvita – vse o najemu na enem mestu.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function loginCodeEmail(to: string, code: string, ttlMinutes: number): EmailMessage {
  const subject = `Tvoja koda za Kvito: ${code}`;
  const text = [
    "Živjo!",
    "",
    `Tvoja koda za prijavo je: ${code}`,
    `Velja ${ttlMinutes} minut.`,
    "",
    "Kode ne potrebuješ? Potem to sporočilo kar prezri.",
  ].join("\n");
  const html = layout(
    subject,
    `<p style="margin:0 0 12px">Živjo!</p>
     <p style="margin:0 0 8px">Tvoja koda za prijavo:</p>
     <p style="margin:0 0 12px;padding:12px 16px;background:${BRAND.slip};border-radius:10px;font-size:32px;font-weight:700;letter-spacing:8px;color:${BRAND.text}">${escapeHtml(code)}</p>
     <p style="margin:0 0 12px">Velja ${ttlMinutes} minut.</p>
     <p style="margin:0;color:${BRAND.muted}">Kode ne potrebuješ? Potem to sporočilo kar prezri.</p>`,
  );
  return { to, subject, text, html };
}
