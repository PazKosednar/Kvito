import { Loader2 } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate } from "react-router";
import { KvitaLogo } from "@/components/KvitaLogo";
import { PaySlipPreview } from "@/components/PaySlipPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { DISPLAY_TIME_ZONE, OTP_LENGTH, ROUTES } from "@/constants";
import { useAuth } from "@/hooks/useAuth";
import { useLoginFlow } from "@/hooks/useLoginFlow";
import { cn } from "@/lib/utils";

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const from = (location.state as { from?: string } | null)?.from ?? ROUTES.home;

  const onSuccess = useCallback(() => void navigate(from, { replace: true }), [navigate, from]);
  const flow = useLoginFlow(onSuccess);

  if (isAuthenticated) return <Navigate to={from} replace />;

  const email = flow.email.trim();
  const sentTime = flow.sentAt?.toLocaleTimeString(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  });

  return (
    <div className="flex min-h-dvh flex-col lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* Story: what Kvita is, shown as a settled rent slip. */}
      <section className="px-6 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-12 lg:flex lg:flex-col lg:px-16 lg:py-14">
        <KvitaLogo withWordmark />
        <div className="mt-8 max-w-md lg:my-auto lg:max-w-lg">
          <h1 className="text-[2.25rem] leading-[1.05] font-extrabold tracking-[-0.035em] text-balance sm:text-display lg:text-[3.5rem]">
            {t("app.headline")}
          </h1>
          <p className="mt-3 max-w-[38ch] text-muted-foreground sm:text-lg">{t("app.lead")}</p>
          <PaySlipPreview
            className={cn("mt-7 max-w-sm lg:mt-14", flow.step === "code" && "hidden lg:block")}
          />
        </div>
      </section>

      {/* Form sheet: bottom of the screen on phones (thumb reach), a side panel on desktop. */}
      <section className="relative z-10 -mt-7 flex-1 rounded-t-[1.75rem] border-t bg-card px-6 pt-7 shadow-[0_-12px_32px_-24px_oklch(0.2_0.05_290/0.35)] lg:mt-0 lg:shadow-none pb-[calc(2rem+env(safe-area-inset-bottom))] lg:flex lg:items-center lg:rounded-none lg:border-t-0 lg:border-l lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          {flow.step === "email" ? (
            <form
              className="flex flex-col"
              onSubmit={(e) => {
                e.preventDefault();
                void flow.submitEmail();
              }}
            >
              <h2 className="text-title font-bold">{t("auth.title")}</h2>
              <p className="mt-2 text-muted-foreground">{t("auth.emailHint")}</p>

              <Label htmlFor="email" className="mt-6 text-sm font-semibold">
                {t("auth.emailLabel")}
              </Label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                required
                placeholder={t("auth.emailPlaceholder")}
                value={flow.email}
                onChange={(e) => flow.setEmail(e.target.value)}
                aria-invalid={flow.error ? true : undefined}
                aria-describedby={flow.error ? "login-error" : undefined}
                className="mt-2 h-13 rounded-lg bg-background px-4 text-base"
              />
              {flow.error && (
                <p id="login-error" role="alert" className="mt-3 text-sm text-destructive">
                  {flow.error}
                </p>
              )}
              <Button type="submit" size="xl" className="mt-6" disabled={flow.pending || !email}>
                {flow.pending && <Loader2 className="animate-spin" />}
                {t("auth.sendCode")}
              </Button>
            </form>
          ) : (
            <form
              className="flex flex-col"
              onSubmit={(e) => {
                e.preventDefault();
                void flow.submitCode();
              }}
            >
              <h2 className="text-title font-bold">{t("auth.codeTitle")}</h2>
              <p className="mt-2 text-muted-foreground">
                {sentTime
                  ? t("auth.codeSentTo", { email, time: sentTime })
                  : t("auth.codeSentToNoTime", { email })}
              </p>

              {/* Boxed digits echo the character fields of a UPN slip. */}
              <div className="mt-8 rounded-lg bg-slip p-3">
                <Label htmlFor="otp" className="mb-2 block text-sm font-semibold text-slip-foreground">
                  {t("auth.codeLabel")}
                </Label>
                <InputOTP
                  id="otp"
                  maxLength={OTP_LENGTH}
                  inputMode="numeric"
                  pattern="^\d+$"
                  autoComplete="one-time-code"
                  autoFocus
                  value={flow.code}
                  onChange={flow.setCode}
                  onComplete={(value: string) => void flow.submitCode(value)}
                  disabled={flow.pending}
                  aria-invalid={flow.error ? true : undefined}
                  aria-describedby="otp-help"
                  containerClassName="w-full"
                >
                  <InputOTPGroup className="grid w-full grid-cols-6 gap-1.5">
                    {Array.from({ length: OTP_LENGTH }, (_, i) => (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className="tabular h-14 w-full rounded-md border border-slip-line/60 bg-card text-2xl font-semibold shadow-none first:rounded-md last:rounded-md dark:bg-card"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <p id="otp-help" className="mt-3 text-sm text-muted-foreground">
                {t("auth.codeValidity")}
              </p>
              {flow.error && (
                <p role="alert" className="mt-3 text-sm font-medium text-destructive">
                  {flow.error}
                </p>
              )}

              <Button
                type="submit"
                size="xl"
                className="mt-6"
                disabled={flow.pending || flow.code.length !== OTP_LENGTH}
              >
                {flow.pending && <Loader2 className="animate-spin" />}
                {t("auth.verify")}
              </Button>

              <div className="mt-5 flex flex-col items-start gap-1 text-sm">
                {flow.cooldown > 0 ? (
                  <p className="tabular py-2 text-muted-foreground" aria-live="polite">
                    {t("auth.resendIn", { seconds: flow.cooldown })}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => void flow.resend()}
                    disabled={flow.pending}
                    className="py-2 font-semibold text-primary underline-offset-4 hover:underline disabled:opacity-50"
                  >
                    {t("auth.resend")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={flow.changeEmail}
                  disabled={flow.pending}
                  className="py-2 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
                >
                  {t("auth.changeEmail")}
                </button>
              </div>

              {import.meta.env.DEV && (
                <p className="mt-6 border-l-2 border-slip-line pl-3 text-xs text-muted-foreground">
                  {t("auth.devHint", { email })}
                </p>
              )}
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
