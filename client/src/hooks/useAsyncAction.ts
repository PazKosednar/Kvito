import { useCallback, useRef, useState } from "react";
import { ApiError } from "@/types/api";
import { useErrorMessage } from "./useErrorMessage";

/**
 * Runs a user action (form submit, button) once at a time and keeps a friendly error message.
 * Field-level validation errors from the API are exposed as `fieldErrors` (path → code).
 */
export function useAsyncAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const toMessage = useErrorMessage();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const busy = useRef(false);

  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      if (busy.current) return undefined;
      busy.current = true;
      setPending(true);
      setError(null);
      setFieldErrors({});
      try {
        return await fn(...args);
      } catch (err) {
        if (err instanceof ApiError && err.code === "VALIDATION_ERROR" && Array.isArray(err.details)) {
          const map: Record<string, string> = {};
          for (const d of err.details as { path: string; message: string }[]) map[d.path] = d.message;
          setFieldErrors(map);
        }
        setError(toMessage(err));
        return undefined;
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    [fn, toMessage],
  );

  return { run, pending, error, fieldErrors, setError };
}
