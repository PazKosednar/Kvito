import { createBrowserRouter } from "react-router";
import { LoginPage } from "@/auth/LoginPage";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { ROUTES } from "@/constants";
import { ChargeFormPage } from "@/features/charges/ChargeFormPage";
import { ChargePage } from "@/features/charges/ChargePage";
import { ChargesTab } from "@/features/charges/ChargesTab";
import { UpnTestPage } from "@/features/charges/UpnTestPage";
import { AcceptInvitePage } from "@/features/invitations/AcceptInvitePage";
import { BankImportPage } from "@/features/bank/BankImportPage";
import { PaymentsPage } from "@/features/payments/PaymentsPage";
import { ContractTab } from "@/features/contract/ContractTab";
import { CostsPage } from "@/features/contract/CostsPage";
import { DepositReturnPage } from "@/features/contract/DepositReturnPage";
import { SettlementPage } from "@/features/contract/SettlementPage";
import { IssueFormPage } from "@/features/issues/IssueFormPage";
import { IssuePage } from "@/features/issues/IssuePage";
import { IssuesTab } from "@/features/issues/IssuesTab";
import { MessagesTab } from "@/features/messages/MessagesTab";
import { DocumentsTab } from "@/features/documents/DocumentsTab";
import { HandoverComparePage } from "@/features/handover/HandoverComparePage";
import { HandoverPage } from "@/features/handover/HandoverPage";
import { HandoverTab } from "@/features/handover/HandoverTab";
import { MetersTab } from "@/features/meters/MetersTab";
import { PropertyFormPage } from "@/features/properties/PropertyFormPage";
import { PropertyPage } from "@/features/properties/PropertyPage";
import { UnitFormPage } from "@/features/properties/UnitFormPage";
import { UnitPage } from "@/features/properties/UnitPage";
import { ChangePasswordPage } from "@/features/account/ChangePasswordPage";
import { MyHistoryPage } from "@/features/account/MyHistoryPage";
import { AnnualSummaryPage } from "@/features/properties/AnnualSummaryPage";
import { ExpenseFormPage } from "@/features/taxes/ExpenseFormPage";
import { TaxesPage } from "@/features/taxes/TaxesPage";
import { BillingPage } from "@/features/billing/BillingPage";
import { CalendarPage } from "@/features/calendar/CalendarPage";
import { ProfitabilityPage } from "@/features/profitability/ProfitabilityPage";
import { ReferencePage } from "@/pages/ReferencePage";
import { PrivacyPage } from "@/features/account/PrivacyPage";
import { NotificationsPage } from "@/features/notifications/NotificationsPage";
import { InvitePage } from "@/features/tenancies/InvitePage";
import { TenancyDetailsTab } from "@/features/tenancies/TenancyDetailsTab";
import { TenancyFormPage } from "@/features/tenancies/TenancyFormPage";
import { TenancyLayout } from "@/features/tenancies/TenancyLayout";
import { AppShell } from "@/layout/AppShell";
import { HomePage } from "@/pages/HomePage";
import { LegalPage } from "@/pages/LegalPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { OnboardingPage } from "@/pages/OnboardingPage";

export const router = createBrowserRouter([
  { path: ROUTES.login, element: <LoginPage /> },
  // Public: an invitation link must work before signing in.
  { path: "/povabilo/:token", element: <AcceptInvitePage /> },
  // Public: a tenant's shared renting history.
  { path: "/referenca/:token", element: <ReferencePage /> },
  // Public legal texts (linked from sign-up).
  { path: ROUTES.terms, element: <LegalPage doc="terms" /> },
  { path: ROUTES.privacyPolicy, element: <LegalPage doc="privacy" /> },
  // Manual UPN QR test page: development only (the samples API is closed in production too).
  ...(import.meta.env.DEV ? [{ path: "/upn-test", element: <UpnTestPage /> }] : []),
  {
    element: <ProtectedRoute />,
    children: [
      { path: ROUTES.onboarding, element: <OnboardingPage /> },
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          { path: "obvestila", element: <NotificationsPage /> },
          { path: "zasebnost", element: <PrivacyPage /> },
          { path: "geslo", element: <ChangePasswordPage /> },
          { path: "letni-povzetek", element: <AnnualSummaryPage /> },
          { path: "davki", element: <TaxesPage /> },
          { path: "narocnina", element: <BillingPage /> },
          { path: "koledar", element: <CalendarPage /> },
          { path: "donosnost", element: <ProfitabilityPage /> },
          { path: "davki/stroski/nov", element: <ExpenseFormPage /> },
          { path: "davki/stroski/:id", element: <ExpenseFormPage /> },
          { path: "moj-zivljenjepis", element: <MyHistoryPage /> },
          { path: "izpisek", element: <BankImportPage /> },
          { path: "placila", element: <PaymentsPage /> },
          { path: "nepremicnine/nova", element: <PropertyFormPage /> },
          { path: "nepremicnine/:id", element: <PropertyPage /> },
          { path: "nepremicnine/:id/uredi", element: <PropertyFormPage /> },
          { path: "enote/:id", element: <UnitPage /> },
          { path: "enote/:id/uredi", element: <UnitFormPage /> },
          { path: "enote/:unitId/najem", element: <TenancyFormPage /> },
          { path: "najemi/:id/uredi", element: <TenancyFormPage /> },
          { path: "najemi/:id/povabi", element: <InvitePage /> },
          {
            path: "najemi/:id",
            element: <TenancyLayout />,
            children: [
              { index: true, element: <ChargesTab /> },
              { path: "obveznosti/nova", element: <ChargeFormPage /> },
              { path: "obveznosti/:chargeId", element: <ChargePage /> },
              { path: "sporocila", element: <MessagesTab /> },
              { path: "pogodba", element: <ContractTab /> },
              { path: "pogodba/varscina", element: <DepositReturnPage /> },
              { path: "pogodba/obracun/:settlementId", element: <SettlementPage /> },
              { path: "pogodba/stroski", element: <CostsPage /> },
              { path: "okvare", element: <IssuesTab /> },
              { path: "okvare/nova", element: <IssueFormPage /> },
              { path: "okvare/:issueId", element: <IssuePage /> },
              { path: "stevci", element: <MetersTab /> },
              { path: "dokumenti", element: <DocumentsTab /> },
              { path: "primopredaja", element: <HandoverTab /> },
              { path: "primopredaja/primerjava", element: <HandoverComparePage /> },
              { path: "primopredaja/:handoverId", element: <HandoverPage /> },
              { path: "podatki", element: <TenancyDetailsTab /> },
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);
