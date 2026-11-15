import { Check, FileUp, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import { FormError, List, PageHeader, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useBankImport } from "@/hooks/useBankImport";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { BankMatch } from "@/types/domain";

/**
 * Landlord uploads the statement from their e-bank; Kvito recognises payments by their reference (sklic)
 * and the landlord confirms them in one go. The file is not stored.
 */
export function BankImportPage() {
  const { t } = useTranslation();
  const bank = useBankImport();
  const [fileName, setFileName] = useState<string | null>(null);

  const upload = useAsyncAction(async (file: File) => {
    setFileName(file.name);
    await bank.upload(file);
  });
  const confirm = useAsyncAction(async () => {
    const r = await bank.confirm();
    toast.success(t("bank.confirmedToast", { count: r.confirmed }));
    setFileName(null);
  });

  const p = bank.preview;
  const count = p ? p.matches.filter((m) => bank.selected.has(m.share.id) && bank.selectable(m)).length : 0;

  return (
    <>
      <PageHeader back={ROUTES.payments} eyebrow={t("bank.eyebrow")} title={t("bank.title")} subtitle={t("bank.subtitle")} />

      <label
        className={cn(
          "flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line-strong bg-surface-raised p-6 text-center transition-colors hover:border-primary/60",
          upload.pending && "pointer-events-none opacity-60",
        )}
      >
        {upload.pending ? <Loader2 className="size-6 animate-spin text-ink-faint" /> : <FileUp className="size-6 text-ink-faint" aria-hidden="true" />}
        <span className="font-medium">{fileName ?? t("bank.choose")}</span>
        <span className="text-sm text-ink-muted">{t("bank.formats")}</span>
        <input
          type="file"
          accept=".xml,.csv,.txt,text/xml,application/xml,text/csv"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload.run(f);
          }}
        />
      </label>
      <FormError message={upload.error} />
      <p className="mt-3 text-sm text-ink-muted">{t("bank.privacy")}</p>

      {p && (
        <>
          <p className="mt-8 label-mono">{t("bank.summary", { credits: p.credits, matched: p.matches.length })}</p>

          {p.matches.length > 0 ? (
            <Section title={t("bank.matches")} className="mt-4">
              <List>
                {p.matches.map((m) => (
                  <MatchRow key={m.entryId + m.share.id} m={m} checked={bank.selected.has(m.share.id)} selectable={bank.selectable(m)} onToggle={() => bank.toggle(m.share.id)} />
                ))}
              </List>
              <div className="mt-6 flex flex-col gap-3">
                <FormError message={confirm.error} />
                <Button size="xl" disabled={confirm.pending || count === 0} onClick={() => void confirm.run()}>
                  {confirm.pending ? <Loader2 className="animate-spin" /> : <Check />}
                  {t("bank.confirm", { count })}
                </Button>
                <Button variant="ghost" onClick={() => (bank.reset(), setFileName(null))}>
                  {t("bank.another")}
                </Button>
              </div>
            </Section>
          ) : (
            <p className="mt-4 rounded-md border border-line bg-surface-raised p-4 text-ink-muted">{t("bank.noMatches")}</p>
          )}

          {p.foreignReferences > 0 && <p className="mt-4 text-sm text-ink-muted">{t("bank.foreign", { count: p.foreignReferences })}</p>}

          {p.unmatched.length > 0 && (
            <details className="mt-8 rounded-md border border-line bg-surface-raised">
              <summary className="cursor-pointer px-4 py-3 font-medium">{t("bank.unmatched", { count: p.unmatched.length })}</summary>
              <p className="px-4 pb-3 text-sm text-ink-muted">{t("bank.unmatchedHint")}</p>
              <ul className="divide-y divide-line border-t border-line">
                {p.unmatched.map((u) => (
                  <li key={u.entryId} className="grid grid-cols-[1fr_auto] gap-x-4 px-4 py-2.5 text-sm">
                    <span className="truncate">{u.counterparty ?? "–"}</span>
                    <span className="mono text-right">{u.amountCents != null ? formatCents(u.amountCents) : "–"}</span>
                    <span className="truncate text-ink-muted">{[u.bookedOn ? formatDate(u.bookedOn) : null, u.purpose].filter(Boolean).join(", ")}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </>
  );
}

function MatchRow({ m, checked, selectable, onToggle }: { m: BankMatch; checked: boolean; selectable: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const differs = m.state === "AMOUNT_DIFFERS" || m.state === "AMOUNT_UNKNOWN";
  return (
    <li className={cn("flex items-start gap-3 px-4 py-3", !selectable && "opacity-70")}>
      <input
        type="checkbox"
        className="mt-1 size-5 shrink-0 accent-[var(--primary)]"
        checked={checked && selectable}
        disabled={!selectable}
        onChange={onToggle}
        aria-label={t("bank.select", { title: m.share.title })}
      />
      <span className="min-w-0 flex-1">
        <Link to={`/najemi/${m.share.tenancyId}/obveznosti/${m.share.chargeId}`} className="block truncate font-medium hover:underline">
          {m.share.title}
        </Link>
        <span className="block truncate text-sm text-ink-muted">
          {m.share.place}, {m.share.tenant}
        </span>
        <span className={cn("mt-1 block text-sm", differs ? "text-warn" : "text-ink-muted")}>
          {t(`bank.state.${m.state}`, { paid: m.amountCents != null ? formatCents(m.amountCents) : "–", expected: formatCents(m.share.amountCents) })}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="mono text-ink">{m.amountCents != null ? formatCents(m.amountCents) : "–"}</span>
        {m.bookedOn && <span className="text-sm text-ink-muted">{formatDate(m.bookedOn)}</span>}
      </span>
    </li>
  );
}
