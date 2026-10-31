import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "@/types/api";

/** Turns any thrown error into a friendly, translated sentence. */
export function useErrorMessage() {
  const { t, i18n } = useTranslation();
  return useCallback(
    (err: unknown): string => {
      if (err instanceof ApiError) {
        if (err.code === "NETWORK") return t("errors.network");
        const key = `errors.${err.code}`;
        if (i18n.exists(key)) return t(key);
      }
      return t("errors.generic");
    },
    [t, i18n],
  );
}
