import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Eyebrow } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROUTES } from "@/constants";
import { CODE_LENGTH, PASSWORD_MIN, type useLoginFlow } from "@/hooks/useLoginFlow";
import { cn } from "@/lib/utils";

type Flow = ReturnType<typeof useLoginFlow>;

const STEP: Record<Flow["mode"], string> = { login: "01", register: "01", verify: "02", forgot: "01", reset: "02" };

/** Sign in, sign up (+ e-mail code), forgotten password (+ code and new password). */
export function AuthForm({ flow }: { flow: Flow }) {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const m = flow.mode;
  const email = flow.email.trim();
  const withEmail = m === "login" || m === "register" || m === "forgot";
  // Confirming asks for the password too (already filled in after signing up), so only the account owner can activate it.
  const withPassword = m !== "forgot";
  const withCode = m === "verify" || m === "reset";
  const newPassword = m === "register" || m === "reset";

  return (
    <>
      {(m === "login" || m === "register") && (
        <div role="tablist" aria-label={t("auth.title")} className="mb-8 grid grid-cols-2 rounded-lg bg-muted p-1">
          {(["login", "register"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={m === tab}
              onClick={() => flow.setMode(tab)}
              className={cn(
                "h-10 rounded-md px-3 text-sm font-semibold transition-colors duration-150",
                m === tab ? "bg-card text-foreground ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`auth.tab.${tab}`)}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          void flow.submit();
        }}
      >
        <Eyebrow index={STEP[m]}>{t(`auth.step.${m}.eyebrow`)}</Eyebrow>
        <h2 className="mt-2 text-title font-semibold">{t(`auth.step.${m}.title`)}</h2>
        <p className="mt-2 text-ink-muted">{t(`auth.step.${m}.hint`, { email })}</p>

        {m === "register" && (
          <>
            <Label htmlFor="name" className="mt-8 text-sm font-medium text-ink">
              {t("auth.nameLabel")}
            </Label>
            <Input id="name" autoComplete="name" required maxLength={80} value={flow.name} onChange={(e) => flow.setName(e.target.value)} className="mt-2" placeholder={t("auth.namePlaceholder")} />
          </>
        )}

        {withEmail && (
          <>
            <Label htmlFor="email" className={cn("text-sm font-medium text-ink", m === "register" ? "mt-5" : "mt-8")}>
              {t("auth.emailLabel")}
            </Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete={m === "register" ? "email" : "username"}
              autoCapitalize="none"
              spellCheck={false}
              autoFocus={m !== "register"}
              required
              placeholder={t("auth.emailPlaceholder")}
              value={flow.email}
              onChange={(e) => flow.setEmail(e.target.value)}
              className="mt-2"
            />
          </>
        )}

        {withCode && (
          <>
            <Label htmlFor="code" className="mt-8 text-sm font-medium text-ink">
              {t("auth.codeLabel")}
            </Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              maxLength={CODE_LENGTH}
              placeholder="000000"
              value={flow.code}
              onChange={(e) => flow.setCode(e.target.value)}
              className="mt-2 h-14 text-center font-mono text-2xl tracking-[0.4em]"
              aria-describedby="code-help"
            />
            <p id="code-help" className="mt-2 text-sm text-ink-muted">
              {t("auth.codeValidity")}
            </p>
          </>
        )}

        {withPassword && (
          <>
            <Label htmlFor="password" className="mt-5 text-sm font-medium text-ink">
              {t(m === "reset" ? "auth.newPasswordLabel" : "auth.passwordLabel")}
            </Label>
            <div className="relative mt-2">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete={newPassword ? "new-password" : "current-password"}
                required
                minLength={newPassword ? PASSWORD_MIN : undefined}
                maxLength={200}
                value={flow.password}
                onChange={(e) => flow.setPassword(e.target.value)}
                aria-invalid={flow.tooShort ? true : undefined}
                aria-describedby={newPassword ? "password-help" : undefined}
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
            {newPassword && (
              <p id="password-help" className={cn("mt-2 text-sm", flow.tooShort ? "text-danger" : "text-ink-muted")}>
                {t("auth.passwordRule", { min: PASSWORD_MIN })}
              </p>
            )}
            {m === "login" && (
              <button type="button" className="mt-2 self-start text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={() => flow.setMode("forgot")}>
                {t("auth.forgot")}
              </button>
            )}
          </>
        )}

        {m === "register" && (
          <label className="mt-5 flex items-start gap-3 text-sm text-ink-muted">
            <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-primary" checked={flow.acceptTerms} onChange={(e) => flow.setAcceptTerms(e.target.checked)} required />
            <span>
              <Trans
                i18nKey="auth.acceptTerms"
                components={{
                  terms: <Link to={ROUTES.terms} target="_blank" className="font-medium text-primary underline-offset-4 hover:underline" />,
                  privacy: <Link to={ROUTES.privacyPolicy} target="_blank" className="font-medium text-primary underline-offset-4 hover:underline" />,
                }}
              />
            </span>
          </label>
        )}

        {flow.error && (
          <p role="alert" className="mt-3 text-sm font-medium text-danger">
            {flow.error}
          </p>
        )}
        {flow.notice && !flow.error && (
          <p role="status" className="mt-3 text-sm text-primary">
            {t(flow.notice)}
          </p>
        )}

        <Button type="submit" size="xl" className="mt-6" disabled={flow.pending || !flow.canSubmit}>
          {flow.pending && <Loader2 className="animate-spin" />}
          {t(`auth.step.${m}.cta`)}
          {!flow.pending && <ArrowRight />}
        </Button>

        <div className="mt-6 flex flex-col items-start gap-1 border-t border-line pt-4 text-sm text-ink-muted">
          {withCode &&
            (flow.cooldown > 0 ? (
              <p className="mono py-1 text-ink-faint" aria-live="polite">
                {t("auth.resendIn", { seconds: flow.cooldown })}
              </p>
            ) : (
              <button type="button" className="py-1 font-medium text-primary underline-offset-4 hover:underline" onClick={() => void flow.resend()} disabled={flow.pending}>
                {t("auth.resend")}
              </button>
            ))}
          {m === "login" || m === "register" ? (
            <p>
              {t(m === "register" ? "auth.haveAccount" : "auth.noAccount")}{" "}
              <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => flow.setMode(m === "register" ? "login" : "register")}>
                {t(m === "register" ? "auth.tab.login" : "auth.tab.register")}
              </button>
            </p>
          ) : (
            <button type="button" className="py-1 font-medium text-primary underline-offset-4 hover:underline" onClick={() => flow.setMode("login")}>
              {t("auth.backToLogin")}
            </button>
          )}
          {withCode && import.meta.env.DEV && <p className="mono mt-3 border-l-2 border-line-strong pl-3 text-ink-faint">{t("auth.devHint", { email })}</p>}
        </div>
      </form>
    </>
  );
}
