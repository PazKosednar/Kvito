import { Check, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IosInstallHint } from "@/components/IosInstallHint";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useGreeting } from "@/hooks/useGreeting";
import { useRole } from "@/hooks/useRole";

/** Phase 0 home: honest about what exists, and tells each role exactly what happens next. */
export function HomePage() {
  const greeting = useGreeting();
  const { activeRole } = useRole();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-title font-bold">{greeting}</h1>
      <IosInstallHint />
      {activeRole === "LANDLORD" ? <LandlordStart /> : <TenantWaiting />}
    </div>
  );
}

function LandlordStart() {
  const { t } = useTranslation();
  // A real sequence, so it is numbered.
  const steps = (["property", "tenancy", "invite"] as const).map((key) => ({
    title: t(`home.landlordSteps.${key}`),
    hint: t(`home.landlordSteps.${key}Hint`),
  }));

  return (
    <section aria-labelledby="landlord-start">
      <h2 id="landlord-start" className="text-lg text-muted-foreground">
        {t("home.landlordIntro")}
      </h2>
      <ol className="mt-5">
        {steps.map((step, i) => (
          <li key={step.title} className="relative flex gap-4 pb-7 last:pb-0">
            {i < steps.length - 1 && (
              <span aria-hidden="true" className="absolute top-10 bottom-1 left-[1.1875rem] w-px bg-border" />
            )}
            <span className="tabular flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-primary/25 text-sm font-bold text-primary">
              {i + 1}
            </span>
            <div className="pt-1.5">
              <p className="font-semibold">{step.title}</p>
              <p className="mt-1 max-w-[46ch] text-muted-foreground">{step.hint}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-sm text-muted-foreground">{t("home.comingSoon")}</p>
    </section>
  );
}

function TenantWaiting() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { copied, copy } = useCopyToClipboard();
  if (!user) return null;

  return (
    <section aria-labelledby="tenant-waiting" className="flex flex-col gap-5">
      <div>
        <h2 id="tenant-waiting" className="text-lg font-semibold">
          {t("home.tenantTitle")}
        </h2>
        <p className="mt-2 max-w-[46ch] text-muted-foreground">{t("home.tenantBody")}</p>
      </div>
      <div className="rounded-xl bg-slip p-4 text-slip-foreground">
        <p className="text-sm">{t("home.tenantEmailLabel")}</p>
        <div className="mt-2 flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate rounded-md bg-card px-3 py-2.5 font-semibold text-card-foreground select-all">
            {user.email}
          </p>
          <Button type="button" variant="secondary" className="h-11 shrink-0 px-4" onClick={() => void copy(user.email)}>
            {copied ? <Check /> : <Copy />}
            {copied ? t("common.copied") : t("common.copy")}
          </Button>
        </div>
      </div>
    </section>
  );
}
