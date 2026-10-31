import { Loader2, Mail } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate } from "react-router";
import { KvitaLogo } from "@/components/KvitaLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { OTP_LENGTH, ROUTES } from "@/constants";
import { useAuth } from "@/hooks/useAuth";
import { useLoginFlow } from "@/hooks/useLoginFlow";

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const from = (location.state as { from?: string } | null)?.from ?? ROUTES.home;

  const onSuccess = useCallback(() => void navigate(from, { replace: true }), [navigate, from]);
  const flow = useLoginFlow(onSuccess);

  if (isAuthenticated) return <Navigate to={from} replace />;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <KvitaLogo withWordmark />
        <p className="text-muted-foreground">{t("app.tagline")}</p>
      </div>

      <Card>
        {flow.step === "email" ? (
          <>
            <CardHeader>
              <CardTitle className="text-xl">{t("auth.title")}</CardTitle>
              <CardDescription>{t("auth.emailHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void flow.submitEmail();
                }}
              >
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">{t("auth.emailLabel")}</Label>
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoFocus
                    required
                    placeholder={t("auth.emailPlaceholder")}
                    value={flow.email}
                    onChange={(e) => flow.setEmail(e.target.value)}
                    className="h-12 text-base"
                  />
                </div>
                {flow.error && (
                  <p role="alert" className="text-sm text-destructive">
                    {flow.error}
                  </p>
                )}
                <Button type="submit" size="lg" className="h-12 text-base" disabled={flow.pending || !flow.email}>
                  {flow.pending ? <Loader2 className="animate-spin" /> : <Mail />}
                  {t("auth.sendCode")}
                </Button>
              </form>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="text-xl">{t("auth.codeTitle")}</CardTitle>
              <CardDescription>{t("auth.codeSentTo", { email: flow.email.trim() })}</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="flex flex-col items-center gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void flow.submitCode();
                }}
              >
                <Label htmlFor="otp" className="sr-only">
                  {t("auth.codeLabel")}
                </Label>
                <InputOTP
                  id="otp"
                  maxLength={OTP_LENGTH}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  value={flow.code}
                  onChange={flow.setCode}
                  onComplete={(value: string) => void flow.submitCode(value)}
                  disabled={flow.pending}
                >
                  <InputOTPGroup>
                    {Array.from({ length: OTP_LENGTH }, (_, i) => (
                      <InputOTPSlot key={i} index={i} className="size-12 text-xl" />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                {flow.error && (
                  <p role="alert" className="text-center text-sm text-destructive">
                    {flow.error}
                  </p>
                )}
                <Button
                  type="submit"
                  size="lg"
                  className="h-12 w-full text-base"
                  disabled={flow.pending || flow.code.length !== OTP_LENGTH}
                >
                  {flow.pending && <Loader2 className="animate-spin" />}
                  {t("auth.verify")}
                </Button>
                <div className="flex w-full justify-between">
                  <Button type="button" variant="link" onClick={flow.changeEmail} disabled={flow.pending}>
                    {t("auth.changeEmail")}
                  </Button>
                  <Button type="button" variant="link" onClick={() => void flow.resend()} disabled={flow.pending}>
                    {t("auth.resend")}
                  </Button>
                </div>
                {import.meta.env.DEV && <p className="text-xs text-muted-foreground">{t("auth.devHint")}</p>}
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
}
