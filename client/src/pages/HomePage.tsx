import { Building2, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/EmptyState";
import { IosInstallHint } from "@/components/IosInstallHint";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";

/** Phase 0 placeholder dashboards; real content arrives with properties (Phase 1) and charges (Phase 2). */
export function HomePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeRole } = useRole();
  const firstName = user?.name?.split(" ")[0];

  return (
    <>
      <h1 className="text-2xl font-bold">
        {firstName ? t("home.greeting", { name: firstName }) : t("home.greetingNoName")}
      </h1>
      <IosInstallHint />
      {activeRole === "LANDLORD" ? (
        <EmptyState icon={Building2} title={t("home.landlordEmptyTitle")} body={t("home.landlordEmptyBody")} />
      ) : (
        <EmptyState icon={KeyRound} title={t("home.tenantEmptyTitle")} body={t("home.tenantEmptyBody")} />
      )}
    </>
  );
}
