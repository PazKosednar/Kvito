import { Check, Copy, Home } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router";
import { IosInstallHint } from "@/components/IosInstallHint";
import { ErrorState, List, ListRow, LoadingState } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { LandlordHome } from "@/features/properties/LandlordHome";
import { useAuth } from "@/hooks/useAuth";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useGreeting } from "@/hooks/useGreeting";
import { useRole } from "@/hooks/useRole";
import { useTenancies } from "@/hooks/useTenancies";

export function HomePage() {
  const greeting = useGreeting();
  const { activeRole } = useRole();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-title font-medium">{greeting}</h1>
      <IosInstallHint />
      {activeRole === "LANDLORD" ? <LandlordHome /> : <TenantHome />}
    </div>
  );
}

/** Tenant home: one tenancy → go straight there (fewer taps to the payment data). */
function TenantHome() {
  const toMessage = useErrorMessage();
  const { tenancies, loading, error, reload } = useTenancies("TENANT");

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={toMessage(error)} onRetry={() => void reload()} />;
  const active = (tenancies ?? []).filter((x) => x.status === "ACTIVE");
  if (active.length === 1) return <Navigate to={`/najemi/${active[0]!.id}`} replace />;
  if (!tenancies?.length) return <TenantWaiting />;

  return (
    <List>
      {tenancies.map((x) => (
        <ListRow
          key={x.id}
          to={`/najemi/${x.id}`}
          leading={<Home className="size-5 shrink-0 text-primary" aria-hidden="true" />}
          title={x.unit.name}
          subtitle={`${x.unit.property.street}, ${x.unit.property.city}`}
        />
      ))}
    </List>
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
          <p className="min-w-0 flex-1 truncate rounded-md bg-slip-field px-3 py-2.5 font-semibold select-all">{user.email}</p>
          <Button type="button" variant="secondary" className="h-11 shrink-0 px-4" onClick={() => void copy(user.email)}>
            {copied ? <Check /> : <Copy />}
            {copied ? t("common.copied") : t("common.copy")}
          </Button>
        </div>
      </div>
    </section>
  );
}
