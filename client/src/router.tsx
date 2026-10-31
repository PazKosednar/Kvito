import { createBrowserRouter } from "react-router";
import { LoginPage } from "@/auth/LoginPage";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { ROUTES } from "@/constants";
import { AcceptInvitePage } from "@/features/invitations/AcceptInvitePage";
import { PropertyFormPage } from "@/features/properties/PropertyFormPage";
import { PropertyPage } from "@/features/properties/PropertyPage";
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
  {
    element: <ProtectedRoute />,
    children: [
      { path: ROUTES.onboarding, element: <OnboardingPage /> },
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          { path: "nepremicnine/nova", element: <PropertyFormPage /> },
          { path: "nepremicnine/:id", element: <PropertyPage /> },
          { path: "nepremicnine/:id/uredi", element: <PropertyFormPage /> },
          { path: "enote/:unitId/najem", element: <TenancyFormPage /> },
          { path: "najemi/:id/uredi", element: <TenancyFormPage /> },
          { path: "najemi/:id/povabi", element: <InvitePage /> },
          {
            path: "najemi/:id",
            element: <TenancyLayout />,
            children: [{ index: true, element: <TenancyDetailsTab /> }],
          },
        ],
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);
