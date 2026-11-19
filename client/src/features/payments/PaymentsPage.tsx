import { Calculator } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { PageHeader } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants";
import { BankImportSection, ExportsSection } from "@/features/properties/OverviewPanel";

/** Landlord's payment tools, kept off the home screen: bank statement import and yearly exports. */
export function PaymentsPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader back={ROUTES.home} eyebrow={t("payments.eyebrow")} title={t("payments.title")} subtitle={t("payments.subtitle")} />
      <BankImportSection className="mt-2" />
      <ExportsSection />
      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-md border border-line bg-surface-raised p-4">
        <p className="min-w-0 flex-1 text-sm text-ink-muted">{t("taxes.entryHint")}</p>
        <Button asChild variant="secondary">
          <Link to={ROUTES.taxes}>
            <Calculator />
            {t("taxes.menu")}
          </Link>
        </Button>
      </div>
    </>
  );
}
