import { useCallback, useState } from "react";
import { STORAGE_KEYS } from "@/constants";
import { storage } from "@/lib/storage";

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as Mac; detect touch support to tell them apart.
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

/** On iOS, Web Push only works for PWAs added to the Home Screen – show a one-time hint. */
export function useIosInstallHint() {
  const [visible, setVisible] = useState(
    () => isIos() && !isStandalone() && storage.get(STORAGE_KEYS.iosHintDismissed) !== "1",
  );
  const dismiss = useCallback(() => {
    storage.set(STORAGE_KEYS.iosHintDismissed, "1");
    setVisible(false);
  }, []);
  return { visible, dismiss };
}
