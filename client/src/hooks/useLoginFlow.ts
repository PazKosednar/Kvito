import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/types/api";
import { useAuth } from "./useAuth";
import { useErrorMessage } from "./useErrorMessage";

/**
 * login → (forgot → reset)
 * register → verify (code from the e-mail) → signed in
 */
export type AuthMode = "login" | "register" | "verify" | "forgot" | "reset";

/** Matches the server rule (server/src/lib/password.ts). */
export const PASSWORD_MIN = 8;
export const CODE_LENGTH = 6;
/** Seconds before another code can be requested. */
const RESEND_COOLDOWN_S = 30;

export function useLoginFlow(onSuccess: () => void) {
  const auth = useAuth();
  const toMessage = useErrorMessage();

  const [mode, setModeState] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const busy = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  const setMode = useCallback((m: AuthMode) => {
    setModeState(m);
    setError(null);
    setNotice(null);
    setPassword("");
    setCode("");
  }, []);

  const needsNewPassword = mode === "register" || mode === "reset";
  const tooShort = needsNewPassword && password.length > 0 && password.length < PASSWORD_MIN;
  const e = email.trim();
  const canSubmit =
    mode === "login"
      ? !!e && !!password
      : mode === "register"
        ? !!name.trim() && !!e && password.length >= PASSWORD_MIN && acceptTerms
        : mode === "verify"
          ? code.length === CODE_LENGTH && !!password
          : mode === "forgot"
            ? !!e
            : code.length === CODE_LENGTH && password.length >= PASSWORD_MIN;

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      if (busy.current) return;
      busy.current = true;
      setPending(true);
      setError(null);
      try {
        await fn();
      } catch (err) {
        // An account that still needs its e-mail confirmed: go straight to the code.
        if (err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED") {
          await auth.resendVerification(e).catch(() => undefined);
          setModeState("verify");
          setCode("");
          setCooldown(RESEND_COOLDOWN_S);
        }
        setError(toMessage(err));
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    [auth, e, toMessage],
  );

  const submit = useCallback(
    () =>
      run(async () => {
        if (!canSubmit) return;
        switch (mode) {
          case "login":
            await auth.login(e, password);
            return onSuccess();
          case "register":
            if (await auth.register({ name: name.trim(), email: e, password })) return onSuccess();
            setModeState("verify");
            setCode("");
            setCooldown(RESEND_COOLDOWN_S);
            return;
          case "verify":
            await auth.verifyEmail(e, code, password);
            return onSuccess();
          case "forgot":
            await auth.forgotPassword(e);
            setModeState("reset");
            setPassword("");
            setCode("");
            setCooldown(RESEND_COOLDOWN_S);
            return;
          case "reset":
            await auth.resetPassword(e, code, password);
            return onSuccess();
        }
      }),
    [run, canSubmit, mode, auth, e, password, name, code, onSuccess],
  );

  const resend = useCallback(
    () =>
      cooldown > 0
        ? Promise.resolve()
        : run(async () => {
            if (mode === "reset") await auth.forgotPassword(e);
            else await auth.resendVerification(e);
            setCooldown(RESEND_COOLDOWN_S);
            setNotice("auth.codeResent");
          }),
    [cooldown, run, mode, auth, e],
  );

  return {
    mode,
    setMode,
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    code,
    setCode: (v: string) => setCode(v.replace(/\D/g, "").slice(0, CODE_LENGTH)),
    acceptTerms,
    setAcceptTerms,
    pending,
    error,
    notice,
    cooldown,
    tooShort,
    canSubmit,
    submit,
    resend,
  };
}
