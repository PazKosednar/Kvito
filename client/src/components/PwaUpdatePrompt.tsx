import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";

/** How often an open app asks the server whether there is a new version. */
const CHECK_EVERY_MS = 15 * 60_000;
/** A new version found this soon after opening, before the user did anything, is applied right away. */
const STARTUP_WINDOW_MS = 10_000;

/**
 * Keeps the app up to date without getting in the way:
 * - found while opening (no interaction yet) → reload to the new version at once;
 * - found while the user is working → a toast with "Posodobi" (no surprise reload mid-task);
 * - the user leaves the tab/app with an update waiting → apply it in the background,
 *   so the next visit already has the new version.
 */
export function PwaUpdatePrompt() {
  const { t } = useTranslation();
  const startedAt = useRef(Date.now());
  const interacted = useRef(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (document.visibilityState === "visible" && navigator.onLine) void registration.update();
      };
      window.setInterval(check, CHECK_EVERY_MS);
      document.addEventListener("visibilitychange", check);
    },
  });

  // Remember the first real interaction (after that we never reload without asking while the page is visible).
  useEffect(() => {
    const mark = () => {
      interacted.current = true;
    };
    const events = ["pointerdown", "keydown"] as const;
    events.forEach((e) => window.addEventListener(e, mark, { once: true, passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, mark));
  }, []);

  useEffect(() => {
    if (!needRefresh) return;
    const apply = () => void updateServiceWorker(true);

    // Opening the app, or the page is not visible: update silently.
    const justOpened = Date.now() - startedAt.current < STARTUP_WINDOW_MS && !interacted.current;
    if (justOpened || document.visibilityState === "hidden") {
      apply();
      return;
    }

    // In use: ask, and also apply when the user leaves the page.
    const id = toast(t("install.updateAvailable"), {
      duration: Infinity,
      action: { label: t("install.update"), onClick: apply },
    });
    const onHide = () => {
      if (document.visibilityState === "hidden") apply();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      toast.dismiss(id);
    };
  }, [needRefresh, t, updateServiceWorker]);

  return null;
}
