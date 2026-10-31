import { Compass } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants";

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4">
      <EmptyState
        icon={Compass}
        title={t("notFound.title")}
        body={t("notFound.body")}
        action={
          <Button asChild size="lg">
            <Link to={ROUTES.home}>{t("notFound.home")}</Link>
          </Button>
        }
      />
    </main>
  );
}
