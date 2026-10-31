import { useTranslation } from "react-i18next";
import { KvitaLogo } from "./KvitaLogo";

export function FullScreenLoader() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3" role="status">
      <KvitaLogo className="animate-pulse" />
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  );
}
