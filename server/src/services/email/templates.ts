import { dateIn, eurIn, type Locale } from "../../i18n/format.js";
import type { EmailMessage } from "./EmailSender.js";

// Brand colors mirror client/src/styles/tokens.css (e-mail clients do not support CSS variables).
const BRAND = { primary: "#0a7a45", text: "#121212", muted: "#55514a", bg: "#eeece7", card: "#f8f7f4", slip: "#e4e1da" };

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const FOOTER: Record<Locale, string> = { sl: "Kvito – vse o najemu na enem mestu.", en: "Kvito – everything about your tenancy in one place." };

function layout(title: string, bodyHtml: string, l: Locale = "sl"): string {
  return `<!doctype html>
<html lang="${l}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:${BRAND.bg};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${BRAND.text}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${BRAND.card};border-radius:16px;padding:28px">
        <tr><td style="font-size:22px;font-weight:700;color:${BRAND.primary};padding-bottom:16px">Kvito</td></tr>
        <tr><td style="font-size:16px;line-height:1.5">${bodyHtml}</td></tr>
        <tr><td style="font-size:13px;color:${BRAND.muted};padding-top:24px">${FOOTER[l]}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function button(url: string, label: string): string {
  return `<a href="${escapeHtml(url)}" style="display:inline-block;margin:8px 0 16px;padding:14px 22px;background:${BRAND.primary};color:#ffffff;border-radius:12px;font-weight:700;text-decoration:none">${escapeHtml(label)}</a>`;
}

const PAYMENT: Record<Locale, { subject: string; intro: string; amount: string; due: string; payee: string; reference: string; purpose: string; qr: string; noMoney: string }> = {
  sl: {
    subject: "Plačilo",
    intro: "Podatki za plačilo",
    amount: "Znesek",
    due: "Rok",
    payee: "Prejemnik",
    reference: "Sklic",
    purpose: "Namen",
    qr: "Kodo UPN QR najdeš v priponki. Skeniraj jo v svoji bančni aplikaciji.",
    noMoney: "Kvito denarja ne prejema. Plačaš v svoji banki.",
  },
  en: {
    subject: "Payment",
    intro: "Payment details",
    amount: "Amount",
    due: "Due",
    payee: "Payee",
    reference: "Reference",
    purpose: "Purpose",
    qr: "The UPN QR code is attached. Scan it in your banking app.",
    noMoney: "Kvito never receives money. You pay in your own bank.",
  },
};

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
  l: Locale = "sl",
): EmailMessage {
  const w = PAYMENT[l];
  const subject = `${w.subject}: ${p.title} (${eurIn(l, p.amountCents)})`;
  const rows: [string, string][] = [
    [w.amount, eurIn(l, p.amountCents)],
    [w.due, dateIn(l, p.dueDate)],
    [w.payee, p.payeeName],
    ["IBAN", p.payeeIban],
    ...(p.reference ? ([[w.reference, p.reference.replace(/^(RF\d{2}|SI\d{2})/, "$1 ")]] as [string, string][]) : []),
    [w.purpose, p.purpose],
  ];
  const text = [`${w.intro}: ${p.title}`, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", p.qrPng ? w.qr : "", w.noMoney].join("\n");
  const html = layout(
    subject,
    `<p style="margin:0 0 12px">${w.intro}: <strong>${escapeHtml(p.title)}</strong></p>
     ${p.qrPng ? `<p style="margin:0 0 12px"><img src="cid:upnqr" width="240" height="240" alt="UPN QR" style="display:block;background:#fff;border-radius:8px"></p>` : ""}
     <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:${BRAND.slip};border-radius:12px;padding:12px 16px">
       ${rows.map(([k, v]) => `<tr><td style="padding:4px 0;color:${BRAND.muted}">${escapeHtml(k)}</td><td style="padding:4px 0;font-weight:600;text-align:right">${escapeHtml(v)}</td></tr>`).join("")}
     </table>
     <p style="margin:16px 0 0;color:${BRAND.muted}">${w.noMoney}</p>`,
    l,
  );
  return {
    to,
    subject,
    text,
    html,
    ...(p.qrPng ? { attachments: [{ filename: "upn-qr.png", content: p.qrPng, contentType: "image/png", cid: "upnqr" }] } : {}),
  };
}

/** The invitee's language is not known yet: Slovenian with a short English line. */
export function invitationEmail(
  to: string,
  p: { url: string; landlordName: string | null; place: string; days: number },
): EmailMessage {
  const who = p.landlordName ?? "Najemodajalec";
  const subject = `${who} te vabi v Kvito`;
  const english = `${p.landlordName ?? "Your landlord"} invites you to join the tenancy in Kvito: ${p.place}. The link is valid for ${p.days} days.`;
  const text = [
    "Živjo!",
    "",
    `${who} te vabi, da se pridružiš najemu: ${p.place}.`,
    "Najemnina, položnice in sporočila bodo na enem mestu.",
    "",
    `Sprejmi povabilo: ${p.url}`,
    `Povezava velja ${p.days} dni.`,
    "",
    english,
  ].join("\n");
  const html = layout(
    subject,
    `<p style="margin:0 0 12px">Živjo!</p>
     <p style="margin:0 0 12px"><strong>${escapeHtml(who)}</strong> te vabi, da se pridružiš najemu: <strong>${escapeHtml(p.place)}</strong>.</p>
     <p style="margin:0 0 4px">Najemnina, položnice in sporočila bodo na enem mestu.</p>
     ${button(p.url, "Sprejmi povabilo · Accept")}
     <p style="margin:0 0 12px;color:${BRAND.muted}">Povezava velja ${p.days} dni. Aplikacije ni treba nameščati.</p>
     <p style="margin:0;color:${BRAND.muted}" lang="en">${escapeHtml(english)}</p>`,
  );
  return { to, subject, text, html };
}

const CODE: Record<"VERIFY_EMAIL" | "RESET_PASSWORD", Record<Locale, { subject: string; intro: string; ignore: string }>> = {
  VERIFY_EMAIL: {
    sl: { subject: "Potrdi e-naslov za Kvito", intro: "S to kodo potrdiš, da je e-naslov tvoj:", ignore: "Računa nisi ustvaril? To e-pošto lahko prezreš." },
    en: { subject: "Confirm your e-mail for Kvito", intro: "Use this code to confirm the e-mail is yours:", ignore: "Didn't sign up? Just ignore this e-mail." },
  },
  RESET_PASSWORD: {
    sl: { subject: "Novo geslo za Kvito", intro: "S to kodo nastaviš novo geslo:", ignore: "Novega gesla nisi zahteval? To e-pošto lahko prezreš, geslo ostane enako." },
    en: { subject: "New password for Kvito", intro: "Use this code to set a new password:", ignore: "Didn't ask for a new password? Ignore this e-mail; your password stays the same." },
  },
};
const VALID: Record<Locale, (m: number) => string> = { sl: (m) => `Koda velja ${m} minut.`, en: (m) => `Valid for ${m} minutes.` };

/** 6-digit code to confirm an e-mail or to set a new password. */
export function codeEmail(to: string, purpose: "VERIFY_EMAIL" | "RESET_PASSWORD", code: string, ttlMinutes: number, l: Locale = "sl"): EmailMessage {
  const w = CODE[purpose][l];
  const subject = `${w.subject}: ${code}`;
  const text = [w.intro, "", code, VALID[l](ttlMinutes), "", w.ignore].join("\n");
  const html = layout(
    subject,
    `<p style="margin:0 0 8px">${w.intro}</p>
     <p style="margin:0 0 12px;padding:12px 16px;background:${BRAND.slip};border-radius:10px;font-size:32px;font-weight:700;letter-spacing:8px;color:${BRAND.text}">${escapeHtml(code)}</p>
     <p style="margin:0 0 12px">${VALID[l](ttlMinutes)}</p>
     <p style="margin:0;color:${BRAND.muted}">${w.ignore}</p>`,
    l,
  );
  return { to, subject, text, html };
}

const OPEN: Record<Locale, string> = { sl: "Odpri v Kvitu", en: "Open in Kvito" };

/** Generic notification (reminders, payment updates) for people who have no push set up. */
export function notificationEmail(to: string, p: { title: string; body: string; url: string }, l: Locale = "sl"): EmailMessage {
  const text = [p.body, "", `${OPEN[l]}: ${p.url}`].join("\n");
  const html = layout(
    p.title,
    `<p style="margin:0 0 4px;font-size:18px;font-weight:700">${escapeHtml(p.title)}</p>
     <p style="margin:0 0 4px">${escapeHtml(p.body)}</p>
     ${button(p.url, OPEN[l])}`,
    l,
  );
  return { to, subject: p.title, text, html };
}
