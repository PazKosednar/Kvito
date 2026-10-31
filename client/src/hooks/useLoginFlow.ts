import { useCallback, useState } from "react";
import { OTP_LENGTH } from "@/constants";
import { useAuth } from "./useAuth";
import { useErrorMessage } from "./useErrorMessage";

type Step = "email" | "code";

/** Two-step passwordless login: e-mail → one-time code. */
export function useLoginFlow(onSuccess: () => void) {
  const { requestCode, verifyCode } = useAuth();
  const toMessage = useErrorMessage();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setPending(true);
      setError(null);
      try {
        await fn();
      } catch (err) {
        setError(toMessage(err));
      } finally {
        setPending(false);
      }
    },
    [toMessage],
  );

  const submitEmail = useCallback(
    () =>
      run(async () => {
        await requestCode(email.trim());
        setCode("");
        setStep("code");
      }),
    [run, requestCode, email],
  );

  const submitCode = useCallback(
    (value = code) =>
      run(async () => {
        if (value.length !== OTP_LENGTH) return;
        await verifyCode(email.trim(), value);
        onSuccess();
      }),
    [run, verifyCode, email, code, onSuccess],
  );

  const resend = useCallback(
    () =>
      run(async () => {
        await requestCode(email.trim());
        setCode("");
      }),
    [run, requestCode, email],
  );

  const changeEmail = useCallback(() => {
    setStep("email");
    setCode("");
    setError(null);
  }, []);

  return { step, email, setEmail, code, setCode, pending, error, submitEmail, submitCode, resend, changeEmail };
}
