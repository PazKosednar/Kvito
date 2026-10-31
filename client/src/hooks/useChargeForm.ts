import { useState } from "react";
import { centsToInput, parseAmountToCents } from "@/lib/money";
import { formatIban, type ScannedBill } from "@/lib/upn";
import type { CostType, PayTo, TenancyDetail } from "@/types/domain";
import type { ChargeInput } from "./useCharges";

export interface ChargeFormValues {
  costType: CostType;
  title: string;
  amount: string;
  dueDate: string;
  payTo: PayTo;
  payeeName: string;
  payeeIban: string;
  payeeStreet: string;
  payeeCity: string;
  reference: string;
  purpose: string;
  description: string;
}

const COST_BY_PURPOSE: Record<string, CostType> = {
  ELEC: "ELECTRICITY",
  WTER: "WATER",
  GASB: "GAS",
  ENRG: "HEATING",
  UBIL: "WASTE",
  PHON: "INTERNET",
  CBTV: "TV",
  BLDM: "MAINTENANCE_FUND",
};

/** New bill form: manual entry, or prefilled from the UPN QR code found on an uploaded bill. */
export function useChargeForm(tenancy: TenancyDetail) {
  const [values, setValues] = useState<ChargeFormValues>({
    costType: tenancy.coveredCosts[0] ?? "OTHER",
    title: "",
    amount: "",
    dueDate: "",
    payTo: "LANDLORD",
    payeeName: "",
    payeeIban: "",
    payeeStreet: "",
    payeeCity: "",
    reference: "",
    purpose: "",
    description: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ChargeFormValues, string>>>({});
  const [scannedPurposeCode, setScannedPurposeCode] = useState<string | null>(null);

  const set = <K extends keyof ChargeFormValues>(k: K, v: ChargeFormValues[K]) => {
    setValues((s) => ({ ...s, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  /** Fill in what the bill's UPN QR says. Paying the supplier directly when the payee is not the landlord. */
  function applyScan(bill: ScannedBill) {
    const toLandlord = bill.payeeIban.replace(/\s/g, "") === tenancy.payeeIban;
    setScannedPurposeCode(bill.purposeCode || null);
    setValues((s) => ({
      ...s,
      costType: COST_BY_PURPOSE[bill.purposeCode] ?? s.costType,
      title: s.title || bill.purpose.slice(0, 80),
      amount: bill.amountCents ? centsToInput(bill.amountCents) : s.amount,
      dueDate: bill.dueDate ?? s.dueDate,
      payTo: toLandlord ? "LANDLORD" : "SUPPLIER",
      payeeName: bill.payeeName,
      payeeIban: formatIban(bill.payeeIban),
      payeeStreet: bill.payeeStreet,
      payeeCity: bill.payeeCity,
      reference: bill.payeeReference,
      purpose: bill.purpose.slice(0, 42),
    }));
    setErrors({});
  }

  function toInput(attachmentIds: string[]): ChargeInput | null {
    const e: typeof errors = {};
    const amountCents = parseAmountToCents(values.amount);
    if (!amountCents) e.amount = "amount";
    if (!values.title.trim()) e.title = "required";
    if (!values.dueDate) e.dueDate = "required";
    if (values.payTo === "SUPPLIER") {
      if (!values.payeeName.trim()) e.payeeName = "required";
      if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(values.payeeIban.replace(/\s/g, "").toUpperCase())) e.payeeIban = "INVALID_IBAN";
    }
    setErrors(e);
    if (Object.keys(e).length) return null;
    const supplier = values.payTo === "SUPPLIER";
    return {
      type: "BILL",
      costType: values.costType,
      title: values.title.trim(),
      description: values.description.trim() || null,
      amountCents: amountCents!,
      dueDate: values.dueDate,
      payTo: values.payTo,
      ...(supplier
        ? {
            payeeName: values.payeeName.trim(),
            payeeIban: values.payeeIban.replace(/\s/g, "").toUpperCase(),
            payeeStreet: values.payeeStreet.trim() || null,
            payeeCity: values.payeeCity.trim() || null,
            reference: values.reference.trim() || null,
          }
        : {}),
      purpose: values.purpose.trim() || null,
      ...(scannedPurposeCode && /^[A-Z]{4}$/.test(scannedPurposeCode) ? { purposeCode: scannedPurposeCode } : {}),
      attachmentIds,
    };
  }

  return { values, set, errors, applyScan, toInput };
}
