import { ArrowLeft, KeyRound, MessagesSquare, Receipt, Wrench } from "lucide-react";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router";
import { ApartmentScene } from "@/components/ApartmentScene";
import { Eyebrow, KvitaLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants";
import { useAuth } from "@/hooks/useAuth";
import { useLoginFlow } from "@/hooks/useLoginFlow";
import { cn } from "@/lib/utils";
import { AuthForm } from "./AuthForm";

/** `?obrazec=prijava|registracija`: on phones the form has its own screen, so the back gesture returns to the welcome screen. */
const FORM_PARAM = "obrazec";
const FORM_MODE = { prijava: "login", registracija: "register" } as const;

const FEATURES = [
  { key: "rent", Icon: Receipt },
  { key: "messages", Icon: MessagesSquare },
  { key: "issues", Icon: Wrench },
  { key: "handover", Icon: KeyRound },
] as const;

/**
 * Desktop: the hero and the form side by side.
 * Phones and tablets: first a welcome screen (hero + "Prijava" / "Registracija"), then the form on its own screen.
 * Someone sent here from a link (an invitation, a page that needs signing in) goes straight to the form.
 * Signed-in users never see this page (they are sent on into the app).
 */
export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const from = (location.state as { from?: string } | null)?.from ?? ROUTES.home;

  const onSuccess = useCallback(() => void navigate(from, { replace: true }), [navigate, from]);
  const flow = useLoginFlow(onSuccess);

  const formParam = params.get(FORM_PARAM);
  const chosen = formParam === "prijava" || formParam === "registracija" ? formParam : null;
  const fromLink = from !== ROUTES.home;
  const welcome = !chosen && !fromLink;
  const { setMode } = flow;

  // Open the form on the tab that was chosen on the welcome screen.
  useEffect(() => {
    if (chosen) setMode(FORM_MODE[chosen]);
    window.scrollTo(0, 0);
  }, [chosen, setMode]);

  const openForm = (which: keyof typeof FORM_MODE) => void navigate({ search: `?${FORM_PARAM}=${which}` }, { state: location.state });

  // Back to the welcome screen: the browser's back when we came from it, otherwise just drop the parameter.
  const back = () => {
    if (location.key !== "default") void navigate(-1);
    else void navigate({ search: "" }, { replace: true, state: location.state });
  };

  if (isAuthenticated) return <Navigate to={from} replace />;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Hero on the panel (CGP; follows the theme). On phones it is the welcome screen only. */}
      <section
        className={cn(
          "on-panel kv-grid-panel flex-col px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-8 sm:px-8 lg:flex lg:px-12 lg:py-10",
          welcome ? "flex h-dvh overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom))] lg:h-auto lg:overflow-visible" : "hidden",
        )}
      >
        <KvitaLockup className="h-6 w-auto self-start lg:h-7" />
        {/* Desktop spacing: free height above text : between text and house : below house = 2 : 1 : 1,
            i.e. the house sits halfway between "right under the text" and "at the very bottom". */}
        <div aria-hidden="true" className="hidden lg:block lg:grow-[2]" />
        <div className="mt-8 lg:mt-0 lg:pt-10">
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
        <div aria-hidden="true" className="hidden lg:block lg:min-h-10 lg:grow" />
        {/* Phones: the house takes the height that is left, so the welcome screen fits on one screen with its buttons. */}
        <ApartmentScene className="mt-6 max-w-[24rem] self-center max-lg:h-0 max-lg:min-h-28 max-lg:flex-1 lg:mt-0 lg:max-w-[min(34rem,62dvh)]" />
        <div aria-hidden="true" className="hidden lg:block lg:grow" />

        {/* Welcome actions (phones and tablets). */}
        <div className="flex w-full flex-col gap-3 pt-6 sm:max-w-sm lg:hidden">
          <Button size="xl" className="w-full" onClick={() => openForm("prijava")}>
            {t("login.welcome.login")}
          </Button>
          <Button size="xl" variant="secondary" className="w-full" onClick={() => openForm("registracija")}>
            {t("login.welcome.register")}
          </Button>
        </div>
      </section>

      {/* Form on stone. On phones it has its own screen, after the welcome screen. */}
      <section
        className={cn(
          "flex-col px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-8 lg:flex lg:flex-row lg:items-center lg:px-12 lg:pt-8",
          welcome ? "hidden" : "flex",
        )}
      >
        <div className="mx-auto mb-8 flex h-10 w-full max-w-sm items-center gap-2 lg:hidden">
          {chosen && (
            <Button variant="ghost" size="icon" className="-ml-2.5" aria-label={t("login.welcome.back")} onClick={back}>
              <ArrowLeft className="size-5" aria-hidden="true" />
            </Button>
          )}
          <KvitaLockup className="h-6 w-auto" />
        </div>
        <div className="mx-auto w-full max-w-sm">
          <AuthForm flow={flow} />
        </div>
      </section>
    </div>
  );
}