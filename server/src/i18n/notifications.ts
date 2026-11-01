import { chargeTitle, dateIn, daysIn, eurIn, type ChargeTitleSource, type Locale } from "./format.js";

export interface Text {
  title: string;
  body: string;
}

/** Wording resolved once the recipient (and so the language) is known. */
export type LocalizedText = (l: Locale) => Text;

const pick = (sl: Text, en: Text): LocalizedText => (l) => (l === "en" ? en : sl);

/** Every notification Kvito sends. Tone: warm, short, informal "ti" in Slovenian. */
export const N = {
  // ---------- Charges & payments ----------
  chargeCreated: (c: ChargeTitleSource, cents: number): LocalizedText => (l) =>
    pick({ title: "Nova obveznost", body: `${chargeTitle(c, "sl")}: ${eurIn("sl", cents)}` }, { title: "New charge", body: `${chargeTitle(c, "en")}: ${eurIn("en", cents)}` })(l),
  paymentReported: (name: string, c: ChargeTitleSource, cents: number): LocalizedText => (l) =>
    pick(
      { title: "Plačilo čaka na potrditev", body: `${name}: ${chargeTitle(c, "sl")} (${eurIn("sl", cents)})` },
      { title: "Payment waiting for confirmation", body: `${name}: ${chargeTitle(c, "en")} (${eurIn("en", cents)})` },
    )(l),
  paymentDisputed: (name: string, c: ChargeTitleSource, cents: number): LocalizedText => (l) =>
    pick(
      { title: "Najemnik se ne strinja z obveznostjo", body: `${name}: ${chargeTitle(c, "sl")} (${eurIn("sl", cents)})` },
      { title: "A tenant disagrees with a charge", body: `${name}: ${chargeTitle(c, "en")} (${eurIn("en", cents)})` },
    )(l),
  paymentConfirmed: (c: ChargeTitleSource, cents: number): LocalizedText => (l) =>
    pick(
      { title: "Plačilo potrjeno", body: `${chargeTitle(c, "sl")}: ${eurIn("sl", cents)} je poravnano.` },
      { title: "Payment confirmed", body: `${chargeTitle(c, "en")}: ${eurIn("en", cents)} is settled.` },
    )(l),
  paymentRejected: (c: ChargeTitleSource): LocalizedText => (l) =>
    pick(
      { title: "Plačilo ni bilo potrjeno", body: `${chargeTitle(c, "sl")}: preveri razlog in poskusi znova.` },
      { title: "Payment not confirmed", body: `${chargeTitle(c, "en")}: check the reason and try again.` },
    )(l),

  // ---------- Reminders ----------
  reminderUpcoming: (c: ChargeTitleSource, cents: number, days: number): LocalizedText => (l) =>
    pick(
      { title: `Rok za plačilo čez ${daysIn("sl", days)}`, body: `${chargeTitle(c, "sl")}: ${eurIn("sl", cents)}` },
      { title: `Payment due in ${daysIn("en", days)}`, body: `${chargeTitle(c, "en")}: ${eurIn("en", cents)}` },
    )(l),
  reminderToday: (c: ChargeTitleSource, cents: number): LocalizedText => (l) =>
    pick(
      { title: "Rok za plačilo je danes", body: `${chargeTitle(c, "sl")}: ${eurIn("sl", cents)}` },
      { title: "Payment is due today", body: `${chargeTitle(c, "en")}: ${eurIn("en", cents)}` },
    )(l),
  reminderOverdue: (c: ChargeTitleSource, cents: number, due: Date): LocalizedText => (l) =>
    pick(
      { title: "Obveznost je v zamudi", body: `${chargeTitle(c, "sl")}: ${eurIn("sl", cents)}. Rok je bil ${dateIn("sl", due)}.` },
      { title: "A payment is overdue", body: `${chargeTitle(c, "en")}: ${eurIn("en", cents)}. It was due ${dateIn("en", due)}.` },
    )(l),
  weeklySummary: (r: { overdue: number; overdueCents: number; waiting: number; soon: number }): LocalizedText => (l) => {
    const sl = [
      r.overdue ? `v zamudi: ${r.overdue} (${eurIn("sl", r.overdueCents)})` : null,
      r.waiting ? `čaka na tvojo potrditev: ${r.waiting}` : null,
      r.soon ? `zapade ta teden: ${r.soon}` : null,
    ];
    const en = [
      r.overdue ? `overdue: ${r.overdue} (${eurIn("en", r.overdueCents)})` : null,
      r.waiting ? `waiting for your confirmation: ${r.waiting}` : null,
      r.soon ? `due this week: ${r.soon}` : null,
    ];
    return pick(
      { title: "Tvoj teden v Kvitu", body: sl.filter(Boolean).join(" · ") },
      { title: "Your week in Kvito", body: en.filter(Boolean).join(" · ") },
    )(l);
  },

  // ---------- Chat ----------
  message: (author: string | null, preview: string): LocalizedText => (l) =>
    pick({ title: author ?? "Novo sporočilo", body: preview || "Priloga" }, { title: author ?? "New message", body: preview || "Attachment" })(l),

  // ---------- Deposit ----------
  depositProposed: (returnCents: number, keptCents: number): LocalizedText => (l) =>
    pick(
      {
        title: "Predlog vračila varščine",
        body: keptCents > 0 ? `Vrnjeno: ${eurIn("sl", returnCents)}, zadržano: ${eurIn("sl", keptCents)}. Preveri in potrdi.` : `Vrnjeno bo vse: ${eurIn("sl", returnCents)}. Preveri in potrdi.`,
      },
      {
        title: "Deposit return proposal",
        body: keptCents > 0 ? `Returned: ${eurIn("en", returnCents)}, kept: ${eurIn("en", keptCents)}. Check and confirm.` : `All of it will be returned: ${eurIn("en", returnCents)}. Check and confirm.`,
      },
    )(l),
  depositAgreed: (name: string): LocalizedText =>
    pick({ title: "Dogovor o varščini", body: `${name} se strinja s predlogom vračila.` }, { title: "Deposit agreed", body: `${name} agrees with the return proposal.` }),
  depositDisputed: (name: string): LocalizedText =>
    pick({ title: "Varščina: ni dogovora", body: `${name} se ne strinja s predlogom vračila. Preberi razlog.` }, { title: "Deposit: no agreement", body: `${name} disagrees with the return proposal. Read the reason.` }),
  depositReturned: (cents: number, on: Date): LocalizedText => (l) =>
    pick(
      { title: "Varščina je vrnjena", body: `Najemodajalec je ${dateIn("sl", on)} vrnil ${eurIn("sl", cents)}. Potrdi, ko denar prispe.` },
      { title: "Deposit returned", body: `Your landlord returned ${eurIn("en", cents)} on ${dateIn("en", on)}. Confirm when the money arrives.` },
    )(l),
  depositReceipt: (name: string): LocalizedText =>
    pick({ title: "Vračilo varščine potrjeno", body: `${name} je potrdil prejem varščine.` }, { title: "Deposit receipt confirmed", body: `${name} confirmed receiving the deposit.` }),

  // ---------- Cost settlement ----------
  settlementSent: (from: Date, to: Date, balanceCents: number): LocalizedText => (l) => {
    const range = `${dateIn(l, from)} – ${dateIn(l, to)}`;
    return pick(
      {
        title: "Obračun stroškov",
        body: balanceCents > 0 ? `${range}: doplačilo ${eurIn("sl", balanceCents)}. Preveri in potrdi.` : balanceCents < 0 ? `${range}: vračilo ${eurIn("sl", -balanceCents)}. Preveri in potrdi.` : `${range}: brez razlike. Preveri in potrdi.`,
      },
      {
        title: "Cost settlement",
        body: balanceCents > 0 ? `${range}: you owe ${eurIn("en", balanceCents)}. Check and confirm.` : balanceCents < 0 ? `${range}: refund of ${eurIn("en", -balanceCents)}. Check and confirm.` : `${range}: no difference. Check and confirm.`,
      },
    )(l);
  },
  settlementAccepted: (name: string): LocalizedText =>
    pick({ title: "Obračun potrjen", body: `${name} se strinja z obračunom stroškov.` }, { title: "Settlement accepted", body: `${name} accepted the cost settlement.` }),
  settlementDisputed: (name: string): LocalizedText =>
    pick({ title: "Obračun: ni dogovora", body: `${name} se ne strinja z obračunom stroškov. Preberi razlog.` }, { title: "Settlement: no agreement", body: `${name} disagrees with the cost settlement. Read the reason.` }),
  settlementRefunded: (cents: number, on: Date): LocalizedText => (l) =>
    pick(
      { title: "Preplačilo je vrnjeno", body: `Najemodajalec je ${dateIn("sl", on)} vrnil ${eurIn("sl", cents)}. Potrdi, ko denar prispe.` },
      { title: "Overpayment returned", body: `Your landlord returned ${eurIn("en", cents)} on ${dateIn("en", on)}. Confirm when the money arrives.` },
    )(l),
  settlementRefundReceipt: (name: string): LocalizedText =>
    pick({ title: "Vračilo potrjeno", body: `${name} je potrdil prejem vračila.` }, { title: "Refund confirmed", body: `${name} confirmed receiving the refund.` }),

  // ---------- Contract & rent ----------
  rentScheduled: (cents: number, from: Date): LocalizedText => (l) =>
    pick(
      { title: "Sprememba najemnine", body: `Od ${dateIn("sl", from)} je najemnina ${eurIn("sl", cents)}.` },
      { title: "Rent change", body: `From ${dateIn("en", from)} the rent is ${eurIn("en", cents)}.` },
    )(l),
  contractEnding: (unit: string, end: Date, days: number, noticeDays: number | null): LocalizedText => (l) =>
    pick(
      {
        title: `Najem se izteče čez ${daysIn("sl", days)}`,
        body: `${unit}: zadnji dan je ${dateIn("sl", end)}.${noticeDays ? ` Odpovedni rok po pogodbi: ${daysIn("sl", noticeDays)}.` : ""} Dogovorita se, ali ga podaljšata.`,
      },
      {
        title: `Tenancy ends in ${daysIn("en", days)}`,
        body: `${unit}: the last day is ${dateIn("en", end)}.${noticeDays ? ` Notice period per contract: ${daysIn("en", noticeDays)}.` : ""} Agree whether to extend it.`,
      },
    )(l),
  contractExpired: (unit: string, end: Date): LocalizedText => (l) =>
    pick(
      { title: "Najem je potekel", body: `${unit}: najem se je iztekel ${dateIn("sl", end)}. Podaljšaj ga ali zaključi.` },
      { title: "Tenancy has expired", body: `${unit}: the tenancy ended on ${dateIn("en", end)}. Extend it or close it.` },
    )(l),
  rentReview: (unit: string): LocalizedText =>
    pick(
      { title: "Čas za pregled najemnine", body: `${unit}: če pogodba določa letno uskladitev, vpiši novo najemnino. Kvito indeksa ne izračuna.` },
      { title: "Time to review the rent", body: `${unit}: if the contract provides for a yearly adjustment, enter the new rent. Kvito does not calculate the index.` },
    ),
};
