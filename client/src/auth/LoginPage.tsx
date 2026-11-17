import { KeyRound, MessagesSquare, Receipt, Wrench } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate } from "react-router";
import { ApartmentScene } from "@/components/ApartmentScene";
import { Eyebrow, KvitaLockup } from "@/components/brand";
import { ROUTES } from "@/constants";
import { useAuth } from "@/hooks/useAuth";
import { useLoginFlow } from "@/hooks/useLoginFlow";
import { AuthForm } from "./AuthForm";

const FEATURES = [
  { key: "rent", Icon: Receipt },
  { key: "messages", Icon: MessagesSquare },
  { key: "issues", Icon: Wrench },
  { key: "handover", Icon: KeyRound },
] as const;

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const from = (location.state as { from?: string } | null)?.from ?? ROUTES.home;

  const onSuccess = useCallback(() => void navigate(from, { replace: true }), [navigate, from]);
  const flow = useLoginFlow(onSuccess);

  if (isAuthenticated) return <Navigate to={from} replace />;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Hero on the panel (CGP; follows the theme). */}
      <section className="on-panel kv-grid-panel flex flex-col px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-8 sm:px-8 lg:px-12 lg:py-10">
        <KvitaLockup className="h-6 w-auto self-start lg:h-7" />
        <div className="mt-8 lg:mt-auto lg:pt-10">
          <Eyebrow onPanel index="01">{t("login.eyebrow")}</Eyebrow>
          <h1 className="mt-3 max-w-[13ch] text-[2.5rem] lg:max-w-[22ch] leading-[2.75rem] font-semibold tracking-[-0.02em] whitespace-pre-line lg:text-display lg:leading-[1.05]">
            {t("app.headline")}
          </h1>
          <p className="mt-4 max-w-[40ch] text-lg leading-7 text-ink-on-panel-muted">{t("app.lead")}</p>
          <ul className="mt-8 hidden max-w-xl grid-cols-2 border-t border-[var(--panel-line)] sm:grid">
            {FEATURES.map(({ key, Icon }) => (
              <li key={key} className="flex items-center gap-3 border-b border-[var(--panel-line)] py-3 pr-4 text-sm text-ink-on-panel">
                <Icon className="size-4 shrink-0 text-signal" aria-hidden="true" strokeWidth={1.75} />
                {t(`login.features.${key}`)}
              </li>
            ))}
          </ul>
        </div>
        {/* Text and house sit together in the middle of the panel (house right under the text, not at the bottom). */}
        <ApartmentScene className="mt-6 max-w-[24rem] self-center lg:mt-10 lg:mb-auto lg:max-w-[min(34rem,62dvh)]" />
      </section>

      {/* Form on stone. */}
      <section className="flex px-4 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-8 lg:items-center lg:px-12">
        <div className="mx-auto w-full max-w-sm">
          <AuthForm flow={flow} />
        </div>
      </section>
    </div>
  );
}