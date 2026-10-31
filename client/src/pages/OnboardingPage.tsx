import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router";
import { toast } from "sonner";
import { Eyebrow } from "@/components/brand";
import { ModuleTile } from "@/components/frame";
import type { GlyphName } from "@/components/iso";
import { KvitaLogo } from "@/components/KvitaLogo";
import { ROUTES } from "@/constants";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useRole } from "@/hooks/useRole";
import type { Role } from "@/types/user";

const OPTIONS: { role: Role; glyph: GlyphName; label: string; title: string; hint: string }[] = [
  { role: "LANDLORD", glyph: "building", label: "onboarding.landlordLabel", title: "onboarding.landlord", hint: "onboarding.landlordHint" },
  { role: "TENANT", glyph: "key", label: "onboarding.tenantLabel", title: "onboarding.tenant", hint: "onboarding.tenantHint" },
];

export function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { needsOnboarding, switchRole } = useRole();
  const toMessage = useErrorMessage();
  const [pending, setPending] = useState<Role | null>(null);

  if (!needsOnboarding) return <Navigate to={ROUTES.home} replace />;

  const choose = async (role: Role) => {
    setPending(role);
    try {
      await switchRole(role);
      void navigate(ROUTES.home, { replace: true });
    } catch (err) {
      toast.error(toMessage(err));
      setPending(null);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="grid grid-cols-[auto_1fr_auto] items-center gap-6 border-b border-line px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-4 sm:px-8">
        <KvitaLogo withWordmark size="sm" />
        <span />
        <p className="label-mono">{t("onboarding.step")}</p>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
        <Eyebrow index="00">{t("onboarding.eyebrowText")}</Eyebrow>
        <h1 className="mt-3 text-title font-semibold text-balance">{t("onboarding.title")}</h1>
        <p className="mt-3 max-w-[50ch] text-muted-foreground">{t("onboarding.subtitle")}</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {OPTIONS.map((o) => (
            <ModuleTile
              key={o.role}
              glyph={o.glyph}
              label={t(o.label)}
              title={t(o.title)}
              body={t(o.hint)}
              onClick={() => void choose(o.role)}
              disabled={pending !== null}
              trailing={pending === o.role ? <span className="label-mono">{t("common.loading")}</span> : null}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
