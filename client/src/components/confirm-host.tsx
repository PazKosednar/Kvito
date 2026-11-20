import { CircleHelp, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConfirmOptions {
  /** Red button and a warning icon (deleting, cancelling). Default true. */
  danger?: boolean;
  confirmLabel?: string;
  title?: string;
}

interface ConfirmRequest extends ConfirmOptions {
  body: string;
  resolve: (ok: boolean) => void;
}

let show: ((req: ConfirmRequest) => void) | null = null;

/**
 * "Are you sure?" in the app's own dialog instead of the browser's confirm() (which looks foreign in the PWA
 * and native shells). Resolves true when confirmed. Falls back to confirm() if the host is not mounted.
 */
export function askConfirm(body: string, options: ConfirmOptions = {}): Promise<boolean> {
  if (!show) return Promise.resolve(window.confirm(body));
  const open = show;
  return new Promise((resolve) => open({ body, ...options, resolve }));
}

/** Mounted once in App, next to the toaster. */
export function ConfirmHost() {
  const { t } = useTranslation();
  const [req, setReq] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    show = (next) =>
      setReq((prev) => {
        prev?.resolve(false); // a second question replaces an unanswered one
        return next;
      });
    return () => {
      show = null;
    };
  }, []);

  const close = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  };
  const danger = req?.danger ?? true;
  const Icon = danger ? TriangleAlert : CircleHelp;

  return (
    <AlertDialog open={req !== null} onOpenChange={(o) => !o && close(false)}>
      <AlertDialogContent>
        <div className="flex items-start gap-3">
          <span className={cn("mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-sm", danger ? "bg-danger-soft text-danger" : "bg-ink/[0.07] text-ink")}>
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div>
            <AlertDialogTitle>{req?.title ?? t("common.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{req?.body}</AlertDialogDescription>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel asChild>
            <Button variant="outline">{t("common.cancel")}</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant={danger ? "destructive" : "default"} onClick={() => close(true)}>
              {req?.confirmLabel ?? t("common.confirm")}
            </Button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
