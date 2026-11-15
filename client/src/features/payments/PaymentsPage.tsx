import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/layout-parts";
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
    </>
  );
}
