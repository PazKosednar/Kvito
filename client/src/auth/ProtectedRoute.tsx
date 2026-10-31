import { Navigate, Outlet, useLocation } from "react-router";
import { ROUTES } from "@/constants";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { FullScreenLoader } from "@/components/FullScreenLoader";

/** Signed-in users only; users without a chosen role are sent to onboarding first. */
export function ProtectedRoute() {
  const { status } = useAuth();
  const { needsOnboarding } = useRole();
  const location = useLocation();

  if (status === "loading") return <FullScreenLoader />;
  if (status === "anonymous") return <Navigate to={ROUTES.login} replace state={{ from: location.pathname }} />;
  if (needsOnboarding && location.pathname !== ROUTES.onboarding) return <Navigate to={ROUTES.onboarding} replace />;
  return <Outlet />;
}
