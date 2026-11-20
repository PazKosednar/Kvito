import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Field, TextInput } from "@/components/form";
import { FormError, PageHeader, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { askConfirm } from "@/components/confirm-host";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useAuth } from "@/hooks/useAuth";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { usePrivacy } from "@/hooks/usePrivacy";
import { ROUTES } from "@/constants";

/** Download everything Kvito holds about you, or delete the account. */
export function PrivacyPage() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const navigate = useNavigate();
  const { user } = useAuth();
  const privacy = usePrivacy();
  const [confirm, setConfirm] = useState("");
  const [exporting, setExporting] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      await privacy.exportData();
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const remove = useAsyncAction(async () => {
    await privacy.deleteAccount(confirm);
    toast.success(t("privacy.deleted"));
    void navigate(ROUTES.login, { replace: true });
  });

  const matches = confirm.trim().toLowerCase() === user?.email.toLowerCase();

  return (
    <>
      <PageHeader back={ROUTES.home} eyebrow={t("privacy.eyebrow")} title={t("privacy.title")} subtitle={t("privacy.subtitle")} />

      <Section title={t("privacy.exportTitle")}>
        <p className="mb-4 max-w-[56ch] text-muted-foreground">{t("privacy.exportBody")}</p>
        <Button variant="outline" disabled={exporting} onClick={() => void exportData()}>
          {exporting ? <Loader2 className="animate-spin" /> : <Download />}
          {t("privacy.exportButton")}
        </Button>
      </Section>

      <Section title={t("privacy.deleteTitle")} className="mt-10">
        <p className="mb-2 max-w-[56ch] text-muted-foreground">{t("privacy.deleteBody")}</p>
        <p className="mb-5 max-w-[56ch] text-sm text-muted-foreground">{t("privacy.deleteKept")}</p>
        <form
          noValidate
          className="flex max-w-sm flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (matches) void askConfirm(t("privacy.deleteConfirm")).then((ok) => ok && void remove.run());
          }}
        >
          <Field label={t("privacy.typeEmail", { email: user?.email ?? "" })}>
            {(p) => <TextInput {...p} type="email" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
          </Field>
          <FormError message={remove.error} />
          <Button type="submit" variant="outline" className="text-danger" disabled={!matches || remove.pending}>
            {remove.pending && <Loader2 className="animate-spin" />}
            {t("privacy.deleteButton")}
          </Button>
        </form>
      </Section>
    </>
  );
}
