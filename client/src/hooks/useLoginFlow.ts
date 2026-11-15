import { useCallback, useRef, useState } from "react";
import { useAuth } from "./useAuth";
import { useErrorMessage } from "./useErrorMessage";

export type AuthMode = "login" | "register";

/** Matches the server rule (server/src/lib/password.ts). */
export const PASSWORD_MIN = 8;

/** Sign in with e-mail and password, or create an account (name, e-mail, password). */
export function useLoginFlow(onSuccess: () => void) {
  const { login, register } = useAuth();
  const toMessage = useErrorMessage();

  const [mode, setModeState] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const setMode = useCallback((m: AuthMode) => {
    setModeState(m);
    setError(null);
    setPassword("");
  }, []);

  const tooShort = mode === "register" && password.length > 0 && password.length < PASSWORD_MIN;
  const canSubmit = !!email.trim() && !!password && (mode === "login" || (!!name.trim() && password.length >= PASSWORD_MIN));

  const submit = useCallback(async () => {
    if (busy.current || !canSubmit) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register({ name: name.trim(), email: email.trim(), password });
      onSuccess();
    } catch (err) {
      setError(toMessage(err));
      if (mode === "login") setPassword("");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }, [canSubmit, mode, login, register, name, email, password, onSuccess, toMessage]);

  return { mode, setMode, name, setName, email, setEmail, password, setPassword, pending, error, tooShort, canSubmit, submit };
}
