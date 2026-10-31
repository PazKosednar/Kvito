import { useTranslation } from "react-i18next";
import { DISPLAY_TIME_ZONE } from "@/constants";
import { firstName } from "@/lib/format";
import { useAuth } from "./useAuth";

/** "Dobro jutro, Mojca" – by local time in Ljubljana. */
export function useGreeting(): string {
  const { t } = useTranslation();
  const { user } = useAuth();
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: DISPLAY_TIME_ZONE }).format(
      new Date(),
    ),
  );
  const key = hour < 10 ? "morning" : hour < 18 ? "day" : "evening";
  const name = firstName(user?.name);
  return name ? `${t(`greeting.${key}`)}, ${name}` : t(`greeting.${key}`);
}
