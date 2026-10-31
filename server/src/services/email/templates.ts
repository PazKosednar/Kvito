import type { EmailMessage } from "./EmailSender.js";

// Brand colors mirror client/src/styles/tokens.css (e-mail clients do not support CSS variables).
const BRAND = { primary: "#0a7a45", text: "#121212", muted: "#55514a", bg: "#eeece7", card: "#f8f7f4", slip: "#e4e1da" };

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

function button(url: string, label: string): string {
  return `<a href="${escapeHtml(url)}" style="display:inline-block;margin:8px 0 16px;padding:14px 22px;background:${BRAND.primary};color:#ffffff;border-radius:12px;font-weight:700;text-decoration:none">${escapeHtml(label)}</a>`;
}

const eur = (cents: number) =>
  new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR", useGrouping: "always" }).format(cents / 100);
const day = (d: Date) => new Intl.DateTimeFormat("sl-SI", { timeZone: "UTC" }).format(d);

/** Payment data + UPN QR (as an attached image), for paying from another device. */
export function paymentEmail(
  to: string,
  p: {
    title: string;
    amountCents: number;
    dueDate: Date;
    payeeName: string;
    payeeIban: string;
    reference: string | null;
    purpose: string;
    qrPng: Buffer | null;
  },
): EmailMessage {
  const subject = `Plačilo: ${p.title} (${eur(p.amountCents)})`;
  const rows: [string, string][] = [
    ["Znesek", eur(p.amountCents)],
    ["Rok", day(p.dueDate)],
    ["Prejemnik", p.payeeName],
    ["IBAN", p.payeeIban],
    ...(p.reference ? ([["Sklic", p.reference.replace(/^(RF\d{2}|SI\d{2})/, "$1 ")]] as [string, string][]) : []),
    ["Namen", p.purpose],
  ];
  const text = [
    `Podatki za plačilo: ${p.title}`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    p.qrPng ? "Kodo UPN QR najdeš v priponki. Skeniraj jo v svoji bančni aplikaciji." : "",
    "Kvita denarja ne prejema. Plačaš v svoji banki.",
  ].join("\n");
  const html = layout(
    subject,
    `<p style="margin:0 0 12px">Podatki za plačilo: <strong>${escapeHtml(p.title)}</strong></p>
     ${p.qrPng ? `<p style="margin:0 0 12px"><img src="cid:upnqr" width="240" height="240" alt="UPN QR" style="display:block;background:#fff;border-radius:8px"></p>` : ""}
     <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:${BRAND.slip};border-radius:12px;padding:12px 16px">
       ${rows.map(([k, v]) => `<tr><td style="padding:4px 0;color:${BRAND.muted}">${escapeHtml(k)}</td><td style="padding:4px 0;font-weight:600;text-align:right">${escapeHtml(v)}</td></tr>`).join("")}
     </table>
     <p style="margin:16px 0 0;color:${BRAND.muted}">Kvita denarja ne prejema. Plačaš v svoji banki.</p>`,
  );
  return {
    to,
    subject,
    text,
    html,
    ...(p.qrPng ? { attachments: [{ filename: "upn-qr.png", content: p.qrPng, contentType: "image/png", cid: "upnqr" }] } : {}),
  };
}

export function invitationEmail(
  to: string,
  p: { url: string; landlordName: string | null; place: string; days: number },
): EmailMessage {
  const who = p.landlordName ?? "Najemodajalec";
  const subject = `${who} te vabi v Kvito`;
  const text = [
    "Živjo!",
    "",
    `${who} te vabi, da se pridružiš najemu: ${p.place}.`,
    "Najemnina, položnice in sporočila bodo na enem mestu.",
    "",
    `Sprejmi povabilo: ${p.url}`,
    `Povezava velja ${p.days} dni.`,
  ].join("\n");
  const html = layout(
    subject,
    `<p style="margin:0 0 12px">Živjo!</p>
     <p style="margin:0 0 12px"><strong>${escapeHtml(who)}</strong> te vabi, da se pridružiš najemu: <strong>${escapeHtml(p.place)}</strong>.</p>
     <p style="margin:0 0 4px">Najemnina, položnice in sporočila bodo na enem mestu.</p>
     ${button(p.url, "Sprejmi povabilo")}
     <p style="margin:0;color:${BRAND.muted}">Povezava velja ${p.days} dni. Aplikacije ni treba nameščati.</p>`,
  );
  return { to, subject, text, html };
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
