import { Building2, ChevronRight, KeyRound, Loader2, type LucideIcon } from "lucide-react";
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
  { role: "TENANT", icon: KeyRound, title: "onboarding.tenant", hint: "onboarding.tenantHint" },
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
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-6 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-10">
      <KvitaLogo withWordmark size="sm" />
      <div className="mt-14">
        <h1 className="text-title font-bold text-balance">{t("onboarding.title")}</h1>
        <p className="mt-3 text-muted-foreground">{t("onboarding.subtitle")}</p>
      </div>
      <div className="mt-8 flex flex-col gap-3">
        {OPTIONS.map(({ role, icon: Icon, title, hint }) => (
          <button
            key={role}
            type="button"
            disabled={pending !== null}
            onClick={() => void choose(role)}
            className="group flex items-center gap-4 rounded-xl border bg-card p-5 text-left transition-colors hover:border-primary/50 disabled:opacity-60"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
              <Icon className="size-6" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold">{t(title)}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{t(hint)}</span>
            </span>
            {pending === role ? (
              <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            )}
          </button>
        ))}
      </div>
    </main>
  );
}
