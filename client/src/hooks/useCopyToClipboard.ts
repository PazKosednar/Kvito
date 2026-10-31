import { useCallback, useEffect, useRef, useState } from "react";

/** Copies text and reports success for a short moment (used for e-mail now, IBAN/amount/reference later). */
export function useCopyToClipboard(resetAfterMs = 2000) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), resetAfterMs);
        return true;
      } catch {
        return false; // clipboard blocked – the text stays selectable
      }
    },
    [resetAfterMs],
  );

  return { copied, copy };
}
