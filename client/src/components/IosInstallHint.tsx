import { Share, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useIosInstallHint } from "@/hooks/useIosInstallHint";

export function IosInstallHint() {
  const { t } = useTranslation();
  const { visible, dismiss } = useIosInstallHint();
  if (!visible) return null;

  return (
    <aside className="relative rounded-md border bg-card p-4 pr-12">
      <p className="flex items-center gap-2 font-semibold">
        <Share className="size-4 text-primary" aria-hidden="true" />
        {t("install.iosTitle")}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{t("install.iosBody")}</p>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("common.close")}
        className="absolute top-2 right-2 flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-5" />
      </button>
    </aside>
  );
}
