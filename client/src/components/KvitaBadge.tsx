import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/** "Kvita ✓" – shown when every obligation of a tenancy is confirmed. */
export function KvitaBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-success px-3 py-1 text-sm font-semibold text-success-foreground",
        className,
      )}
      title={t("home.kvitaHint")}
    >
      {t("home.kvita")}
    </span>
  );
}
