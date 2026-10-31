import { Share, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useIosInstallHint } from "@/hooks/useIosInstallHint";

export function IosInstallHint() {
  const { t } = useTranslation();
  const { visible, dismiss } = useIosInstallHint();
  if (!visible) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border bg-accent p-4 text-accent-foreground">
      <Share className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="flex-1">
        <p className="font-semibold">{t("install.iosTitle")}</p>
        <p className="text-sm">{t("install.iosBody")}</p>
      </div>
      <Button variant="ghost" size="icon" onClick={dismiss} aria-label={t("common.close")}>
        <X className="size-5" />
      </Button>
    </div>
  );
}
