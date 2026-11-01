import { createBrowserRouter } from "react-router";
import { LoginPage } from "@/auth/LoginPage";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { ROUTES } from "@/constants";
import { ChargeFormPage } from "@/features/charges/ChargeFormPage";
import { ChargePage } from "@/features/charges/ChargePage";
import { ChargesTab } from "@/features/charges/ChargesTab";
import { UpnTestPage } from "@/features/charges/UpnTestPage";
import { AcceptInvitePage } from "@/features/invitations/AcceptInvitePage";
import { IssueFormPage } from "@/features/issues/IssueFormPage";
import { IssuePage } from "@/features/issues/IssuePage";
import { IssuesTab } from "@/features/issues/IssuesTab";
import { MessagesTab } from "@/features/messages/MessagesTab";
import { DocumentsTab } from "@/features/documents/DocumentsTab";
import { HandoverPage } from "@/features/handover/HandoverPage";
import { HandoverTab } from "@/features/handover/HandoverTab";
import { MetersTab } from "@/features/meters/MetersTab";
import { PropertyFormPage } from "@/features/properties/PropertyFormPage";
import { PropertyPage } from "@/features/properties/PropertyPage";
import { PrivacyPage } from "@/features/account/PrivacyPage";
import { NotificationsPage } from "@/features/notifications/NotificationsPage";
import { InvitePage } from "@/features/tenancies/InvitePage";
import { TenancyDetailsTab } from "@/features/tenancies/TenancyDetailsTab";
import { TenancyFormPage } from "@/features/tenancies/TenancyFormPage";
import { TenancyLayout } from "@/features/tenancies/TenancyLayout";
import { AppShell } from "@/layout/AppShell";
import { HomePage } from "@/pages/HomePage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { OnboardingPage } from "@/pages/OnboardingPage";

export const router = createBrowserRouter([
  { path: ROUTES.login, element: <LoginPage /> },
  // Public: an invitation link must work before signing in.
  { path: "/povabilo/:token", element: <AcceptInvitePage /> },
  // Manual UPN QR test page (samples are only served outside production).
  { path: "/upn-test", element: <UpnTestPage /> },
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
          { path: "nepremicnine/nova", element: <PropertyFormPage /> },
          { path: "nepremicnine/:id", element: <PropertyPage /> },
          { path: "nepremicnine/:id/uredi", element: <PropertyFormPage /> },
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
              { path: "okvare", element: <IssuesTab /> },
              { path: "okvare/nova", element: <IssueFormPage /> },
              { path: "okvare/:issueId", element: <IssuePage /> },
              { path: "stevci", element: <MetersTab /> },
              { path: "dokumenti", element: <DocumentsTab /> },
              { path: "primopredaja", element: <HandoverTab /> },
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
