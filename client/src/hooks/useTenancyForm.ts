import { useState } from "react";
import { centsToInput, parseAmountToCents } from "@/lib/money";
import { todayInput, toDateInput } from "@/lib/dates";
import type { CostType, SplitMethod, TenancyDetail } from "@/types/domain";
import type { TenancyInput } from "./useTenancies";

export interface TenancyFormValues {
  startDate: string;
  endDate: string;
  rent: string;
  rentDueDay: string;
  deposit: string;
  payeeName: string;
  payeeIban: string;
  payeeStreet: string;
  payeeCity: string;
  coveredCosts: CostType[];
  splitMethod: SplitMethod;
  noticePeriodDays: string;
  /** "" = no yearly review reminder, otherwise "1"–"12". */
  rentReviewMonth: string;
  paymentNote: string;
}

const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

/** Form state + client-side checks for a tenancy. The server validates again (IBAN checksum, dates). */
export function useTenancyForm(existing: TenancyDetail | undefined, defaults: { payeeName?: string | null }) {
  const [values, setValues] = useState<TenancyFormValues>(() => ({
    startDate: toDateInput(existing?.startDate) || todayInput(),
    endDate: toDateInput(existing?.endDate),
    rent: centsToInput(existing?.rentCents),
    rentDueDay: existing ? String(existing.rentDueDay) : "5",
    deposit: centsToInput(existing?.depositCents),
    payeeName: existing?.payeeName ?? defaults.payeeName ?? "",
    payeeIban: existing?.payeeIban ?? "",
    payeeStreet: existing?.payeeStreet ?? "",
    payeeCity: existing?.payeeCity ?? "",
    coveredCosts: existing?.coveredCosts ?? ["ELECTRICITY", "WATER"],
    splitMethod: existing?.splitMethod ?? "EQUAL",
    noticePeriodDays: existing?.noticePeriodDays ? String(existing.noticePeriodDays) : "",
    rentReviewMonth: existing?.rentReviewMonth ? String(existing.rentReviewMonth) : "",
    paymentNote: existing?.paymentNote ?? "",
  }));
  const [errors, setErrors] = useState<Partial<Record<keyof TenancyFormValues, string>>>({});

  const set = <K extends keyof TenancyFormValues>(key: K, value: TenancyFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  /** Returns the API payload, or null (and field errors) when something is off. */
  function toInput(): TenancyInput | null {
    const e: typeof errors = {};
    const rentCents = parseAmountToCents(values.rent);
    if (rentCents === null) e.rent = "amount";
    const depositCents = values.deposit.trim() ? parseAmountToCents(values.deposit) : null;
    if (values.deposit.trim() && depositCents === null) e.deposit = "amount";
    const day = Number(values.rentDueDay);
    if (!Number.isInteger(day) || day < 1 || day > 31) e.rentDueDay = "dueDay";
    if (!values.startDate) e.startDate = "required";
    if (values.endDate && values.endDate < values.startDate) e.endDate = "END_BEFORE_START";
    if (!values.payeeName.trim()) e.payeeName = "required";
    const iban = values.payeeIban.replace(/\s+/g, "").toUpperCase();
    if (!IBAN_RE.test(iban)) e.payeeIban = "INVALID_IBAN";
    const notice = values.noticePeriodDays.trim() ? Number(values.noticePeriodDays) : null;
    if (notice !== null && (!Number.isInteger(notice) || notice < 1 || notice > 730)) e.noticePeriodDays = "noticeDays";
    setErrors(e);
    if (Object.keys(e).length > 0) return null;
    return {
      startDate: values.startDate,
      endDate: values.endDate || null,
      rentCents: rentCents!,
      rentDueDay: day,
      depositCents,
      payeeName: values.payeeName.trim(),
      payeeIban: iban,
      payeeStreet: values.payeeStreet.trim() || null,
      payeeCity: values.payeeCity.trim() || null,
      coveredCosts: values.coveredCosts,
      splitMethod: values.splitMethod,
      noticePeriodDays: notice,
      rentReviewMonth: values.rentReviewMonth ? Number(values.rentReviewMonth) : null,
      paymentNote: values.paymentNote.trim() || null,
    };
  }

  // TODO(preveri): the legal cap on a deposit for residential leases; until confirmed, Kvito only points it out.
  const rentCents = parseAmountToCents(values.rent);
  const depositCents = values.deposit.trim() ? parseAmountToCents(values.deposit) : null;
  const depositAboveThreeRents = rentCents !== null && rentCents > 0 && depositCents !== null && depositCents > rentCents * 3;

  return { values, set, errors, setErrors, toInput, depositAboveThreeRents };
}
