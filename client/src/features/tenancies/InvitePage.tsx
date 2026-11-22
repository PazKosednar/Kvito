import { Check, Copy, Link2, Loader2, Share2, X } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useParams } from "react-router";
import { Field, TextInput } from "@/components/form";
import { ErrorState, FormError, List, LoadingState, PageHeader, Section } from "@/components/layout-parts";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useInvitations, useTenancy } from "@/hooks/useTenancies";
import { formatDate } from "@/lib/dates";

/** Landlord invites a tenant: link + QR to show on the spot, optional e-mail. */
export function InvitePage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { tenancy, loading, error, reload, isLandlord } = useTenancy(id);
  const toMessage = useErrorMessage();
  const { invitations, create, revoke } = useInvitations(id);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);

  const createInvite = useAsyncAction(async () => {
    const res = await create(email.trim());
    setLink(res.url);
  });

  if (loading) return <LoadingState />;
  if (error || !tenancy) return <ErrorState message={toMessage(error)} onRetry={() => void reload()} />;
  if (!isLandlord) return <Navigate to={`/najemi/${tenancy.id}`} replace />;
  const pending = (invitations ?? []).filter((i) => i.state === "PENDING");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        back={`/najemi/${tenancy.id}`}
        title={t("invite.title")}
        subtitle={`${tenancy.unit.property.name}, ${tenancy.unit.name}`}
      />

      {link ? (
        <InviteLink url={link} onAnother={() => { setLink(null); setEmail(""); }} sentTo={email.trim() || null} />
      ) : (
        <form
          className="flex max-w-2xl flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void createInvite.run();
          }}
        >
          <p className="text-muted-foreground">{t("invite.intro")}</p>
          <Field label={t("invite.email")} hint={t("invite.emailHint")}>
            {(p) => (
              <TextInput {...p} type="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("auth.emailPlaceholder")} />
            )}
          </Field>
          <FormError message={createInvite.error} />
          <Button type="submit" size="xl" disabled={createInvite.pending}>
            {createInvite.pending ? <Loader2 className="animate-spin" /> : <Link2 />}
            {t("invite.create")}
          </Button>
        </form>
      )}

      {pending.length > 0 && (
        <Section title={t("invite.pending")} className="mt-10">
          <List>
            {pending.map((inv) => (
              <li key={inv.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{inv.email ?? t("invite.anyone")}</span>
                  <span className="block text-sm text-muted-foreground">
                    {t("invite.validUntil", { date: formatDate(inv.expiresAt) })}
                  </span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => void revoke(inv.id)}>
                  <X />
                  {t("invite.revoke")}
                </Button>
              </li>
            ))}
          </List>
        </Section>
      )}
    </div>
  );
}

function InviteLink({ url, onAnother, sentTo }: { url: string; onAnother: () => void; sentTo: string | null }) {
  const { t } = useTranslation();
  const { copied, copy } = useCopyToClipboard();
  const [svg, setSvg] = useState("");

  useEffect(() => {
    void QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1 }).then(setSvg);
  }, [url]);

  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted-foreground">{sentTo ? t("invite.sent", { email: sentTo }) : t("invite.showOrSend")}</p>
      {/* Black on white so every phone camera reads it, in both themes. */}
      <div
        className="mx-auto w-full max-w-64 rounded-md bg-white p-3 [&_svg]:h-auto [&_svg]:w-full"
        role="img"
        aria-label={t("invite.qrLabel")}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="rounded-lg bg-muted px-4 py-3 text-sm break-all select-all">{url}</p>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" className="h-12" onClick={() => void copy(url)}>
          {copied ? <Check /> : <Copy />}
          {copied ? t("common.copied") : t("common.copy")}
        </Button>
        {canShare ? (
          <Button
            variant="secondary"
            className="h-12"
            onClick={() => void navigator.share({ title: "Kvito", text: t("invite.shareText"), url }).catch(() => undefined)}
          >
            <Share2 />
            {t("invite.share")}
          </Button>
        ) : (
          <Button variant="secondary" className="h-12" onClick={onAnother}>
            {t("invite.another")}
          </Button>
        )}
      </div>
      {canShare && (
        <Button variant="ghost" onClick={onAnother}>
          {t("invite.another")}
        </Button>
      )}
      <p className="text-sm text-muted-foreground">{t("invite.onceNote")}</p>
    </div>
  );
}
