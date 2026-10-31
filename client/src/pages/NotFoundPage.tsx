import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { KvitaLogo } from "@/components/KvitaLogo";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants";

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-6 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-10">
      <KvitaLogo withWordmark size="sm" />
      <div className="my-auto">
        <p className="tabular text-[5rem] leading-none font-extrabold tracking-[-0.05em] text-primary/20">404</p>
        <h1 className="mt-4 text-title font-medium">{t("notFound.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("notFound.body")}</p>
        <Button asChild size="xl" className="mt-8">
          <Link to={ROUTES.home}>{t("notFound.home")}</Link>
        </Button>
      </div>
    </main>
  );
}
