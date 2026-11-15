import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Field, TextInput } from "@/components/form";
import { FormError, PageHeader } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useAuth } from "@/hooks/useAuth";
import { PASSWORD_MIN } from "@/hooks/useLoginFlow";

/** Signed-in user sets a new password; other devices are signed out. */
export function ChangePasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { changePassword, user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const tooShort = next.length > 0 && next.length < PASSWORD_MIN;
  const mismatch = repeat.length > 0 && repeat !== next;

  const save = useAsyncAction(async () => {
    await changePassword(current, next);
    toast.success(t("password.saved"));
    void navigate(ROUTES.home);
  });

  return (
    <>
      <PageHeader back={ROUTES.home} title={t("password.title")} subtitle={t("password.subtitle")} />
      <form
        className="flex max-w-md flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!tooShort && !mismatch) void save.run();
        }}
      >
        {/* Lets password managers attach the new password to the right account. */}
        <input type="email" autoComplete="username" value={user?.email ?? ""} readOnly hidden />
        <Field label={t("password.current")}>{(p) => <TextInput {...p} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />}</Field>
        <Field label={t("password.next")} hint={t("password.rule", { min: PASSWORD_MIN })} error={tooShort ? "PASSWORD_TOO_SHORT" : undefined}>
          {(p) => <TextInput {...p} type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} maxLength={200} value={next} onChange={(e) => setNext(e.target.value)} />}
        </Field>
        <Field label={t("password.repeat")} error={mismatch ? "PASSWORD_MISMATCH" : undefined}>
          {(p) => <TextInput {...p} type="password" autoComplete="new-password" required value={repeat} onChange={(e) => setRepeat(e.target.value)} />}
        </Field>
        <FormError message={save.error} />
        <Button type="submit" size="xl" disabled={save.pending || !current || next.length < PASSWORD_MIN || repeat !== next}>
          {save.pending && <Loader2 className="animate-spin" />}
          {t("password.cta")}
        </Button>
      </form>
    </>
  );
}
