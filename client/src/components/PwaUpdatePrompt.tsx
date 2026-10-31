import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";

/** Registers the service worker and offers a reload when a new version is available. */
export function PwaUpdatePrompt() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!needRefresh) return;
    toast(t("install.updateAvailable"), {
      duration: Infinity,
      action: { label: t("install.update"), onClick: () => void updateServiceWorker(true) },
    });
  }, [needRefresh, t, updateServiceWorker]);

  return null;
}
