import { useCallback, useEffect, useRef, useState } from "react";
import { OTP_LENGTH } from "@/constants";
import { ApiError } from "@/types/api";
import { useAuth } from "./useAuth";
import { useErrorMessage } from "./useErrorMessage";

type Step = "email" | "code";

/** Seconds before another code can be requested (prevents piles of codes and mix-ups). */
export const RESEND_COOLDOWN_S = 30;

/** Two-step passwordless login: e-mail → one-time code. */
export function useLoginFlow(onSuccess: () => void) {
  const { requestCode, verifyCode } = useAuth();
  const toMessage = useErrorMessage();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<Date | null>(null);
  const [cooldown, setCooldown] = useState(0);
  // Guards against double submission (auto-submit on the 6th digit + Enter).
  const busy = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  const run = useCallback(
    async (fn: () => Promise<void>, onError?: (err: unknown) => void) => {
      if (busy.current) return;
      busy.current = true;
      setPending(true);
      setError(null);
      try {
        await fn();
      } catch (err) {
        setError(toMessage(err));
        onError?.(err);
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    [toMessage],
  );

  const send = useCallback(async () => {
    await requestCode(email.trim());
    setCode("");
    setSentAt(new Date());
    setCooldown(RESEND_COOLDOWN_S);
  }, [requestCode, email]);

  const submitEmail = useCallback(
    () =>
      run(
        async () => {
          await send();
          setStep("code");
        },
        // A code requested moments ago is still valid: let the user type it in.
        (err) => {
          if (err instanceof ApiError && err.code === "OTP_RATE_LIMITED") setStep("code");
        },
      ),
    [run, send],
  );

  const submitCode = useCallback(
    (value = code) =>
      run(
        async () => {
          if (value.length !== OTP_LENGTH) return;
          await verifyCode(email.trim(), value);
          onSuccess();
        },
        () => setCode(""),
      ),
    [run, verifyCode, email, code, onSuccess],
  );

  const resend = useCallback(() => (cooldown > 0 ? Promise.resolve() : run(send)), [run, send, cooldown]);

  const changeEmail = useCallback(() => {
    setStep("email");
    setCode("");
    setError(null);
  }, []);

  return {
    step,
    email,
    setEmail,
    code,
    setCode,
    pending,
    error,
    sentAt,
    cooldown,
    submitEmail,
    submitCode,
    resend,
    changeEmail,
  };
}
