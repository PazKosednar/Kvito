import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { formatDate } from "@/lib/dates";
import type { Charge } from "@/types/domain";

type TitleSource = Pick<Charge, "type" | "title" | "rentPeriod" | "autoKey">;

/**
 * Generated charges (rent, advances, deposit, settlement) are titled in the reader's language;
 * titles the landlord typed stay as written. Mirrors server/src/i18n/format.ts.
 */
export function useChargeTitle() {
  const { t, i18n } = useTranslation();
  const month = useCallback(
    (period: string) =>
      new Intl.DateTimeFormat(i18n.language === "en" ? "en-GB" : "sl-SI", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${period}-01T00:00:00Z`)),
    [i18n.language],
  );
  return useCallback(
    (c: TitleSource): string => {
      if (c.type === "RENT" && c.rentPeriod) return t("chargeTitle.rent", { month: month(c.rentPeriod) });
      if (c.type === "ADVANCE" && c.autoKey?.startsWith("advance:")) return t("chargeTitle.advance", { month: month(c.autoKey.slice(8)) });
      if (c.type === "DEPOSIT") return t("chargeTitle.deposit");
      if (c.type === "SETTLEMENT" && c.autoKey?.startsWith("settlement:")) {
        const [, from, to] = c.autoKey.split(":");
        return t("chargeTitle.settlement", { from: formatDate(from!), to: formatDate(to!) });
      }
      return c.title;
    },
    [t, month],
  );
}
