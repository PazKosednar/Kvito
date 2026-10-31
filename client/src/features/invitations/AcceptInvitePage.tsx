import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { KvitaLogo } from "@/components/KvitaLogo";
import { LoadingState } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants";
import { useAcceptInvitation } from "@/hooks/useAcceptInvitation";
import { useAuth } from "@/hooks/useAuth";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { formatDate } from "@/lib/dates";

/** Public landing page of an invitation link / QR code. Works without installing anything. */
export function AcceptInvitePage() {
  const { token } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const toMessage = useErrorMessage();
  const { status, user } = useAuth();
  const { preview, loadError, accepting, accept } = useAcceptInvitation(token);

  const join = async () => {
    try {
      const tenancyId = await accept();
      toast.success(t("acceptInvite.joined"));
      void navigate(`/najemi/${tenancyId}`, { replace: true });
    } catch (err) {
      toast.error(toMessage(err));
    }
  };

  let body: React.ReactNode;
  if (loadError) {
    body = (
      <>
        <h1 className="text-title font-bold">{t("acceptInvite.notFoundTitle")}</h1>
        <p className="mt-3 text-muted-foreground">{t("acceptInvite.notFoundBody")}</p>
      </>
    );
  } else if (!preview || status === "loading") {
    body = <LoadingState />;
  } else if (preview.state !== "PENDING") {
    body = (
      <>
        <h1 className="text-title font-bold">{t(`acceptInvite.state.${preview.state}`)}</h1>
        <p className="mt-3 text-muted-foreground">{t("acceptInvite.askNew")}</p>
      </>
    );
  } else {
    const mismatch = !!(user && preview.email && preview.email !== user.email);
    body = (
      <>
        <p className="text-muted-foreground">
          {t("acceptInvite.from", { name: preview.landlordName ?? t("acceptInvite.yourLandlord") })}
        </p>
        <h1 className="mt-2 text-title font-bold text-balance">{t("acceptInvite.title")}</h1>
        <div className="mt-6 rounded-xl bg-slip p-5 text-slip-foreground">
          <p className="text-lg font-bold">{preview.unitName}</p>
          <p className="mt-1">{preview.propertyName}</p>
          <p className="opacity-80">
            {preview.street}, {preview.city}
          </p>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          {t("acceptInvite.validUntil", { date: formatDate(preview.expiresAt) })}
        </p>
        {mismatch && (
          <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {t("acceptInvite.emailMismatch", { email: preview.email })}
          </p>
        )}
        {user ? (
          <Button size="xl" className="mt-8 w-full" disabled={accepting || mismatch} onClick={() => void join()}>
            {accepting && <Loader2 className="animate-spin" />}
            {t("acceptInvite.join")}
          </Button>
        ) : (
          <>
            <Button
              size="xl"
              className="mt-8 w-full"
              onClick={() => void navigate(ROUTES.login, { state: { from: location.pathname } })}
            >
              {t("acceptInvite.signInToJoin")}
            </Button>
            <p className="mt-3 text-sm text-muted-foreground">{t("acceptInvite.noApp")}</p>
          </>
        )}
      </>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-6 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-10">
      <KvitaLogo withWordmark size="sm" />
      <div className="my-auto py-10">{body}</div>
    </main>
  );
}
