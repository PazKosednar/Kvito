import { ArrowRight, Eye, EyeOff, KeyRound, Loader2, MessagesSquare, Receipt, Wrench } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate } from "react-router";
import { ApartmentScene } from "@/components/ApartmentScene";
import { Eyebrow, KvitaLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROUTES } from "@/constants";
import { useAuth } from "@/hooks/useAuth";
import { PASSWORD_MIN, useLoginFlow } from "@/hooks/useLoginFlow";
import { cn } from "@/lib/utils";

const FEATURES = [
  { key: "rent", Icon: Receipt },
  { key: "messages", Icon: MessagesSquare },
  { key: "issues", Icon: Wrench },
  { key: "handover", Icon: KeyRound },
] as const;

export function LoginPage() {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const from = (location.state as { from?: string } | null)?.from ?? ROUTES.home;

  const onSuccess = useCallback(() => void navigate(from, { replace: true }), [navigate, from]);
  const flow = useLoginFlow(onSuccess);

  if (isAuthenticated) return <Navigate to={from} replace />;
  const register = flow.mode === "register";

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Hero on the always-dark panel (CGP). */}
      <section className="on-panel kv-grid-panel flex flex-col px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-8 sm:px-8 lg:px-12 lg:py-10">
        <KvitaLockup className="h-6 w-auto self-start lg:h-7" />
        <div className="mt-8 lg:mt-auto">
          <Eyebrow onPanel index="01">{t("login.eyebrow")}</Eyebrow>
          <h1 className="mt-3 max-w-[13ch] text-[2.5rem] lg:max-w-[22ch] leading-[2.75rem] font-semibold tracking-[-0.02em] whitespace-pre-line lg:text-display">
            {t("app.headline")}
          </h1>
          <p className="mt-4 max-w-[40ch] text-lg leading-7 text-ink-on-panel-muted">{t("app.lead")}</p>
          <ul className="mt-8 hidden max-w-xl grid-cols-2 border-t border-[#232327] sm:grid">
            {FEATURES.map(({ key, Icon }) => (
              <li key={key} className="flex items-center gap-3 border-b border-[#232327] py-3 pr-4 text-sm text-ink-on-panel">
                <Icon className="size-4 shrink-0 text-signal" aria-hidden="true" strokeWidth={1.75} />
                {t(`login.features.${key}`)}
              </li>
            ))}
          </ul>
        </div>
        <ApartmentScene className="mt-6 max-w-[24rem] self-center lg:mt-auto lg:max-w-[34rem]" />
      </section>

      {/* Form on stone. */}
      <section className="flex px-4 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-8 lg:items-center lg:px-12">
        <div className="mx-auto w-full max-w-sm">
          {/* Sign in / create account */}
          <div role="tablist" aria-label={t("auth.title")} className="mb-8 grid grid-cols-2 rounded-lg bg-muted p-1">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={flow.mode === m}
                onClick={() => flow.setMode(m)}
                className={cn(
                  "h-10 rounded-md px-3 text-sm font-semibold transition-colors duration-150",
                  flow.mode === m ? "bg-card text-foreground ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`auth.tab.${m}`)}
              </button>
            ))}
          </div>

          <form
            className="flex flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              void flow.submit();
            }}
          >
            <Eyebrow index={register ? "02" : "01"}>{t(register ? "auth.tab.register" : "auth.tab.login")}</Eyebrow>
            <h2 className="mt-2 text-title font-semibold">{t(register ? "auth.registerTitle" : "auth.title")}</h2>
            <p className="mt-2 text-ink-muted">{t(register ? "auth.registerHint" : "auth.loginHint")}</p>

            {register && (
              <>
                <Label htmlFor="name" className="mt-8 text-sm font-medium text-ink">
                  {t("auth.nameLabel")}
                </Label>
                <Input id="name" autoComplete="name" required maxLength={80} value={flow.name} onChange={(e) => flow.setName(e.target.value)} className="mt-2" placeholder={t("auth.namePlaceholder")} />
              </>
            )}

            <Label htmlFor="email" className={cn("text-sm font-medium text-ink", register ? "mt-5" : "mt-8")}>
              {t("auth.emailLabel")}
            </Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete={register ? "email" : "username"}
              autoCapitalize="none"
              spellCheck={false}
              autoFocus={!register}
              required
              placeholder={t("auth.emailPlaceholder")}
              value={flow.email}
              onChange={(e) => flow.setEmail(e.target.value)}
              className="mt-2"
            />

            <Label htmlFor="password" className="mt-5 text-sm font-medium text-ink">
              {t("auth.passwordLabel")}
            </Label>
            <div className="relative mt-2">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete={register ? "new-password" : "current-password"}
                required
                minLength={register ? PASSWORD_MIN : undefined}
                maxLength={200}
                value={flow.password}
                onChange={(e) => flow.setPassword(e.target.value)}
                aria-invalid={flow.error || flow.tooShort ? true : undefined}
                aria-describedby="password-help"
                className="pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={t(showPassword ? "auth.hidePassword" : "auth.showPassword")}
                aria-pressed={showPassword}
                className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-sm text-ink-muted hover:text-ink"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p id="password-help" className={cn("mt-2 text-sm", flow.tooShort ? "text-danger" : "text-ink-muted")}>
              {register ? t("auth.passwordRule", { min: PASSWORD_MIN }) : t("auth.noReset")}
            </p>

            {flow.error && (
              <p role="alert" className="mt-2 text-sm font-medium text-danger">
                {flow.error}
              </p>
            )}
            <Button type="submit" size="xl" className="mt-6" disabled={flow.pending || !flow.canSubmit}>
              {flow.pending && <Loader2 className="animate-spin" />}
              {t(register ? "auth.registerCta" : "auth.loginCta")}
              {!flow.pending && <ArrowRight />}
            </Button>

            <p className="mt-6 border-t border-line pt-4 text-sm text-ink-muted">
              {t(register ? "auth.haveAccount" : "auth.noAccount")}{" "}
              <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => flow.setMode(register ? "login" : "register")}>
                {t(register ? "auth.tab.login" : "auth.tab.register")}
              </button>
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}
