import { Building2, Home, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router";
import { toast } from "sonner";
import { KvitaLogo } from "@/components/KvitaLogo";
import { ROUTES } from "@/constants";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useRole } from "@/hooks/useRole";
import type { Role } from "@/types/user";

const OPTIONS: { role: Role; icon: LucideIcon; title: string; hint: string }[] = [
  { role: "LANDLORD", icon: Building2, title: "onboarding.landlord", hint: "onboarding.landlordHint" },
  { role: "TENANT", icon: Home, title: "onboarding.tenant", hint: "onboarding.tenantHint" },
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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <KvitaLogo withWordmark className="self-center" />
      <div className="text-center">
        <h1 className="text-2xl font-bold">{t("onboarding.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("onboarding.subtitle")}</p>
      </div>
      <div className="flex flex-col gap-3">
        {OPTIONS.map(({ role, icon: Icon, title, hint }) => (
          <button
            key={role}
            type="button"
            disabled={pending !== null}
            onClick={() => void choose(role)}
            className="flex min-h-20 items-center gap-4 rounded-xl border bg-card p-4 text-left transition hover:border-primary hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
              <Icon className="size-6" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-lg font-semibold">{t(title)}</span>
              <span className="block text-sm text-muted-foreground">{t(hint)}</span>
            </span>
          </button>
        ))}
      </div>
    </main>
  );
}
