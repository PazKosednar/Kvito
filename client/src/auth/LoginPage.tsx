import { ArrowRight, Loader2 } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate } from "react-router";
import { IsoScene, Mosaic } from "@/components/iso";
import { KvitaLogo } from "@/components/KvitaLogo";
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
    <div className="flex min-h-dvh flex-col">
      {/* Frame: corner labels like a technical drawing. */}
      <header className="grid grid-cols-[auto_1fr_auto] items-start gap-6 border-b px-5 pt-[calc(1rem+env(safe-area-inset-top))] pb-4 sm:px-8">
        <KvitaLogo withWordmark size="sm" />
        <div className="hidden pt-1 sm:block">
          <p className="label-mono">{t("frame.line1")}</p>
          <p className="label-mono">{t("frame.line2")}</p>
        </div>
        <p className="label-mono justify-self-end pt-1">{t("frame.region")}</p>
      </header>

      <div className="grid flex-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* Story */}
        <section className="relative flex flex-col overflow-hidden px-5 pt-8 pb-6 sm:px-8 lg:border-r lg:pt-16">
          <p className="label-mono">{t("frame.section")}</p>
          <h1 className="mt-4 text-[2.6rem] whitespace-pre-line leading-[0.98] font-medium tracking-[-0.05em] sm:text-display lg:text-[4.25rem]">
            {t("app.headline")}
          </h1>
          <p className="mt-5 max-w-[40ch] text-muted-foreground">{t("app.lead")}</p>
          <IsoScene
            className="animate-settle mt-6 w-full max-w-[17rem] self-center sm:max-w-md lg:mt-auto lg:max-w-lg"
            labels={[t("frame.cube1"), t("frame.cube2"), t("frame.cube3")]}
          />
          <Mosaic className="pointer-events-none absolute bottom-0 left-0 hidden w-48 lg:grid" />
        </section>

        {/* Form cell */}
        <section className="flex border-t px-5 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-8 lg:items-center lg:border-t-0">
          <div className="mx-auto w-full max-w-sm">
            {flow.step === "email" ? (
              <form
                className="flex flex-col"
                onSubmit={(e) => {
                  e.preventDefault();
                  void flow.submitEmail();
                }}
              >
                <p className="label-mono">{t("auth.stepEmail")}</p>
                <h2 className="mt-3 text-title font-medium">{t("auth.title")}</h2>
                <p className="mt-2 text-muted-foreground">{t("auth.emailHint")}</p>

                <Label htmlFor="email" className="label-mono mt-8 text-[0.6875rem]">
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
                  className="mt-2 h-13 bg-card px-4 text-base"
                />
                {flow.error && (
                  <p id="login-error" role="alert" className="mt-3 text-sm text-destructive">
                    {flow.error}
                  </p>
                )}
                <Button type="submit" size="xl" className="group mt-5 justify-between" disabled={flow.pending || !email}>
                  {t("auth.sendCode")}
                  {flow.pending ? <Loader2 className="animate-spin" /> : <ArrowRight className="transition-transform group-hover:translate-x-0.5" />}
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
                <p className="label-mono">{t("auth.stepCode")}</p>
                <h2 className="mt-3 text-title font-medium">{t("auth.codeTitle")}</h2>
                <p className="mt-2 text-muted-foreground">
                  {sentTime ? t("auth.codeSentTo", { email, time: sentTime }) : t("auth.codeSentToNoTime", { email })}
                </p>

                <Label htmlFor="otp" className="label-mono mt-8 mb-2 text-[0.6875rem]">
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
                  <InputOTPGroup className="grid w-full grid-cols-6 border-y border-l">
                    {Array.from({ length: OTP_LENGTH }, (_, i) => (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className="h-16 w-full rounded-none border-0 border-r bg-card font-mono text-2xl shadow-none first:rounded-none last:rounded-none data-[active=true]:ring-2 data-[active=true]:ring-primary dark:bg-card"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>

                <p id="otp-help" className="mt-3 text-sm text-muted-foreground">
                  {t("auth.codeValidity")}
                </p>
                {flow.error && (
                  <p role="alert" className="mt-3 text-sm font-medium text-destructive">
                    {flow.error}
                  </p>
                )}

                <Button type="submit" size="xl" className="mt-6 justify-between" disabled={flow.pending || flow.code.length !== OTP_LENGTH}>
                  {t("auth.verify")}
                  {flow.pending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                </Button>

                <div className="mt-4 flex flex-col items-start border-t pt-2 text-sm">
                  {flow.cooldown > 0 ? (
                    <p className="tabular py-2 font-mono text-xs text-muted-foreground" aria-live="polite">
                      {t("auth.resendIn", { seconds: flow.cooldown })}
                    </p>
                  ) : (
                    <button type="button" onClick={() => void flow.resend()} disabled={flow.pending} className="py-2 font-medium text-primary hover:underline disabled:opacity-50">
                      {t("auth.resend")}
                    </button>
                  )}
                  <button type="button" onClick={flow.changeEmail} disabled={flow.pending} className="py-2 text-muted-foreground hover:text-foreground disabled:opacity-50">
                    {t("auth.changeEmail")}
                  </button>
                </div>

                {import.meta.env.DEV && <p className="mt-6 border-l-2 border-primary pl-3 font-mono text-xs text-muted-foreground">{t("auth.devHint", { email })}</p>}
              </form>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
