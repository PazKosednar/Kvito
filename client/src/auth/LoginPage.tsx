import { ArrowRight, Loader2 } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate } from "react-router";
import { Eyebrow, KvitaLockup, UnitsIllustration } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { DISPLAY_TIME_ZONE, OTP_LENGTH, ROUTES } from "@/constants";
import { useAuth } from "@/hooks/useAuth";
import { useLoginFlow } from "@/hooks/useLoginFlow";

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
  const sentTime = flow.sentAt?.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit", timeZone: DISPLAY_TIME_ZONE });

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Hero on the always-dark panel (CGP). */}
      <section className="on-panel kv-grid-panel flex flex-col px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-8 sm:px-8 lg:px-12 lg:py-10">
        <KvitaLockup className="h-6 w-auto self-start lg:h-7" />
        <div className="mt-8 lg:mt-auto">
          <Eyebrow onPanel index="01">{t("login.eyebrow")}</Eyebrow>
          <h1 className="mt-3 max-w-[13ch] text-[2.5rem] leading-[2.75rem] font-semibold tracking-[-0.02em] whitespace-pre-line lg:text-display">
            {t("app.headline")}
          </h1>
          <p className="mt-4 max-w-[40ch] text-lg leading-7 text-ink-on-panel-muted">{t("app.lead")}</p>
        </div>
        <UnitsIllustration onPanel className="mt-6 max-w-[22rem] self-center lg:mt-auto lg:max-w-[30rem]" />
      </section>

      {/* Form on stone. */}
      <section className="flex px-4 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-8 lg:items-center lg:px-12">
        <div className="mx-auto w-full max-w-sm">
          {flow.step === "email" ? (
            <form
              className="flex flex-col"
              onSubmit={(e) => {
                e.preventDefault();
                void flow.submitEmail();
              }}
            >
              <Eyebrow index="01">{t("auth.stepEmail")}</Eyebrow>
              <h2 className="mt-2 text-title font-semibold">{t("auth.title")}</h2>
              <p className="mt-2 text-ink-muted">{t("auth.emailHint")}</p>

              <Label htmlFor="email" className="mt-8 text-sm font-medium text-ink">
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
                className="mt-2"
              />
              {flow.error && (
                <p id="login-error" role="alert" className="mt-2 text-sm text-danger">
                  {flow.error}
                </p>
              )}
              <Button type="submit" size="xl" className="mt-6" disabled={flow.pending || !email}>
                {flow.pending ? <Loader2 className="animate-spin" /> : null}
                {t("auth.sendCode")}
                {!flow.pending && <ArrowRight />}
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
              <Eyebrow index="02">{t("auth.stepCode")}</Eyebrow>
              <h2 className="mt-2 text-title font-semibold">{t("auth.codeTitle")}</h2>
              <p className="mt-2 text-ink-muted">
                {sentTime ? t("auth.codeSentTo", { email, time: sentTime }) : t("auth.codeSentToNoTime", { email })}
              </p>

              <Label htmlFor="otp" className="mt-8 mb-2 text-sm font-medium text-ink">
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
                <InputOTPGroup className="grid w-full grid-cols-6 gap-2">
                  {Array.from({ length: OTP_LENGTH }, (_, i) => (
                    <InputOTPSlot
                      key={i}
                      index={i}
                      className="h-14 w-full rounded-sm border border-line-strong bg-surface-raised font-mono text-2xl shadow-none first:rounded-sm first:border-l last:rounded-sm data-[active=true]:z-10 data-[active=true]:border-ink data-[active=true]:ring-2 data-[active=true]:ring-[var(--focus)] data-[active=true]:ring-offset-2 data-[active=true]:ring-offset-surface dark:bg-surface-raised"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>

              <p id="otp-help" className="mt-2 text-sm text-ink-muted">
                {t("auth.codeValidity")}
              </p>
              {flow.error && (
                <p role="alert" className="mt-2 text-sm font-medium text-danger">
                  {flow.error}
                </p>
              )}

              <Button type="submit" size="xl" className="mt-6" disabled={flow.pending || flow.code.length !== OTP_LENGTH}>
                {flow.pending && <Loader2 className="animate-spin" />}
                {t("auth.verify")}
              </Button>

              <div className="mt-4 flex flex-col items-start border-t border-line pt-2 text-sm">
                {flow.cooldown > 0 ? (
                  <p className="mono py-2 text-ink-faint" aria-live="polite">
                    {t("auth.resendIn", { seconds: flow.cooldown })}
                  </p>
                ) : (
                  <Button type="button" variant="ghost" className="-ml-4 text-primary" onClick={() => void flow.resend()} disabled={flow.pending}>
                    {t("auth.resend")}
                  </Button>
                )}
                <Button type="button" variant="ghost" className="-ml-4 text-ink-muted" onClick={flow.changeEmail} disabled={flow.pending}>
                  {t("auth.changeEmail")}
                </Button>
              </div>

              {import.meta.env.DEV && <p className="mono mt-6 border-l-2 border-line-strong pl-3 text-ink-faint">{t("auth.devHint", { email })}</p>}
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
