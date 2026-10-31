import { CheckCheck, FileText, Loader2, Paperclip, RotateCcw, Trash2, Undo2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Field, Textarea, TextInput } from "@/components/form";
import { KvitaStamp } from "@/components/KvitaStamp";
import { ErrorState, FormError, List, LoadingState, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { uploadAttachment, useCharge } from "@/hooks/useCharges";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { apiUrl } from "@/lib/api";
import { formatDate, formatDateTime, todayInput } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import type { Attachment, Charge, ChargeShare } from "@/types/domain";
import { useTenancyContext } from "@/features/tenancies/TenancyLayout";
import { ChargeStatusPill, DueText } from "./charge-ui";
import { PaySlip } from "./PaySlip";

export function ChargePage() {
  const { chargeId } = useParams();
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const navigate = useNavigate();
  const { tenancy } = useTenancyContext();
  const q = useCharge(chargeId);

  if (q.loading) return <LoadingState />;
  if (q.error || !q.charge) return <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />;
  const { charge, myShare, isLandlord } = q;

  const remove = async () => {
    if (!window.confirm(t("charges.confirmDelete", { title: charge.title }))) return;
    try {
      await q.remove();
      toast.success(t("charges.deleted"));
      void navigate(`/najemi/${tenancy.id}`);
    } catch (err) {
      toast.error(toMessage(err));
    }
  };

  const shown = isLandlord ? charge : { ...charge, status: myShare?.status ?? charge.status };

  return (
    <>
      <div className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-medium tracking-tight">{charge.title}</h2>
          <ChargeStatusPill status={shown.status} />
        </div>
        <p className="mt-1 text-muted-foreground">
          <DueText dueDate={charge.dueDate} status={shown.status} />
          {charge.shares.length > 1 && `, ${t("charges.total", { amount: formatCents(charge.amountCents) })}`}
        </p>
        {charge.description && <p className="mt-3 whitespace-pre-line">{charge.description}</p>}
        <Files files={charge.attachments} />
      </div>

      {!isLandlord && myShare && <TenantShare charge={charge} share={myShare} q={q} />}
      {isLandlord && <LandlordShares charge={charge} q={q} />}

      {isLandlord && !charge.shares.some((s) => s.status === "CONFIRMED") && (
        <Section>
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void remove()}>
            <Trash2 />
            {t("charges.delete")}
          </Button>
        </Section>
      )}
    </>
  );
}

type Q = ReturnType<typeof useCharge>;

// ---------- Tenant ----------

function TenantShare({ charge, share, q }: { charge: Charge; share: ChargeShare; q: Q }) {
  const { t } = useTranslation();
  const [reporting, setReporting] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const lastReport = share.paymentReports[0];

  if (share.status === "CONFIRMED") {
    return (
      <div className="flex items-center gap-4 rounded-xl border bg-card p-5">
        <KvitaStamp className="shrink-0" />
        <p className="text-muted-foreground">
          {t("charges.confirmedOn", { date: share.confirmedAt ? formatDate(share.confirmedAt) : "" })}
        </p>
      </div>
    );
  }

  if (share.status === "REPORTED_PAID") {
    return (
      <div className="rounded-xl border bg-card p-5">
        <p className="font-semibold">{t("charges.reportedTitle")}</p>
        <p className="mt-1 text-muted-foreground">{t("charges.reportedBody")}</p>
        {lastReport && <ReportLine report={lastReport} />}
      </div>
    );
  }

  return (
    <>
      {share.status === "DISPUTED" && (
        <p className="mb-4 rounded-lg bg-info/10 px-4 py-3 text-sm">{t("charges.disputedNote")}</p>
      )}
      {lastReport?.status === "REJECTED" && (
        <p className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t("charges.rejectedNote", { reason: lastReport.rejectReason ?? t("charges.noReason") })}
        </p>
      )}
      <PaySlip chargeId={charge.id} shareId={share.id} />

      <Section>
        {reporting ? (
          <ReportForm charge={charge} share={share} q={q} onDone={() => setReporting(false)} />
        ) : (
          <Button size="xl" className="w-full" onClick={() => setReporting(true)}>
            <CheckCheck />
            {t("charges.reportPaid")}
          </Button>
        )}
        {!reporting && share.status !== "DISPUTED" && (
          disputing ? (
            <ReasonForm
              className="mt-4"
              label={t("charges.disputeLabel")}
              submit={t("charges.disputeSubmit")}
              onSubmit={(reason) => q.dispute(share.id, reason)}
              onCancel={() => setDisputing(false)}
            />
          ) : (
            <Button variant="ghost" className="mt-2 w-full text-muted-foreground" onClick={() => setDisputing(true)}>
              {t("charges.disputeCta")}
            </Button>
          )
        )}
      </Section>
    </>
  );
}

function ReportForm({ charge, share, q, onDone }: { charge: Charge; share: ChargeShare; q: Q; onDone: () => void }) {
  const { t } = useTranslation();
  const [paidOn, setPaidOn] = useState(todayInput());
  const [note, setNote] = useState("");
  const [proof, setProof] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const toMessage = useErrorMessage();

  const save = useAsyncAction(async () => {
    await q.report(share.id, { paidOn, note: note.trim() || null, ...(proof ? { attachmentIds: [proof.id] } : {}) });
    toast.success(t("charges.reported"));
    onDone();
  });

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      setProof(await uploadAttachment(charge.tenancyId, file, "PAYMENT_PROOF"));
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4 rounded-xl border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save.run();
      }}
    >
      <p className="font-semibold">{t("charges.reportTitle", { amount: formatCents(share.amountCents) })}</p>
      <Field label={t("charges.paidOn")}>{(p) => <TextInput {...p} type="date" value={paidOn} max={todayInput()} onChange={(e) => setPaidOn(e.target.value)} />}</Field>
      <Field label={t("charges.note")} hint={t("charges.noteHint")}>
        {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="min-h-20" />}
      </Field>
      <div>
        {proof ? (
          <p className="flex items-center gap-2 text-sm">
            <Paperclip className="size-4" aria-hidden="true" />
            <span className="truncate">{proof.fileName}</span>
            <button type="button" className="ml-auto rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label={t("common.remove")} onClick={() => setProof(null)}>
              <X className="size-4" />
            </button>
          </p>
        ) : (
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed px-4 text-sm font-medium hover:border-primary/50">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
            {t("charges.addProof")}
            <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
          </label>
        )}
      </div>
      <FormError message={save.error} />
      <div className="flex gap-2">
        <Button type="submit" className="h-12 flex-1" disabled={save.pending || uploading}>
          {save.pending && <Loader2 className="animate-spin" />}
          {t("charges.reportSubmit")}
        </Button>
        <Button type="button" variant="ghost" className="h-12" onClick={onDone}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

// ---------- Landlord ----------

function LandlordShares({ charge, q }: { charge: Charge; q: Q }) {
  const { t } = useTranslation();
  return (
    <>
      <Section title={charge.shares.length > 1 ? t("charges.shares") : t("charges.payment")}>
        <List>
          {charge.shares.map((s) => (
            <LandlordShareRow key={s.id} share={s} q={q} />
          ))}
        </List>
      </Section>
      <Section title={t("charges.paymentData")}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl border bg-card px-4 py-3 text-sm">
          <dt className="text-muted-foreground">{t("pay.payee")}</dt>
          <dd className="text-right font-medium">{charge.payeeName}</dd>
          <dt className="text-muted-foreground">{t("pay.purposeCode")}</dt>
          <dd className="text-right font-medium">{charge.purposeCode}</dd>
          <dt className="text-muted-foreground">{t("pay.via")}</dt>
          <dd className="text-right font-medium">{t(`charges.payTo.${charge.payTo}`)}</dd>
        </dl>
      </Section>
    </>
  );
}

function LandlordShareRow({ share, q }: { share: ChargeShare; q: Q }) {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const name = share.member.user.name ?? share.member.user.email;
  const pending = share.paymentReports.find((r) => r.status === "PENDING");

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{name}</span>
          <span className="block text-sm text-muted-foreground">{formatCents(share.amountCents)}</span>
        </span>
        <ChargeStatusPill status={share.status} />
      </div>
      {pending && <ReportLine report={pending} />}
      <div className="mt-3 flex flex-wrap gap-2">
        {share.status === "REPORTED_PAID" && !rejecting && (
          <>
            <Button className="h-10" disabled={busy} onClick={() => void run(() => q.confirm(share.id), t("charges.confirmed"))}>
              <CheckCheck />
              {t("charges.confirm")}
            </Button>
            <Button variant="outline" className="h-10" disabled={busy} onClick={() => setRejecting(true)}>
              <Undo2 />
              {t("charges.reject")}
            </Button>
          </>
        )}
        {(share.status === "OPEN" || share.status === "OVERDUE" || share.status === "DISPUTED") && (
          <Button variant="outline" className="h-10" disabled={busy} onClick={() => void run(() => q.confirm(share.id), t("charges.confirmed"))}>
            <CheckCheck />
            {t("charges.markPaid")}
          </Button>
        )}
        {(share.status === "CONFIRMED" || share.status === "DISPUTED") && (
          <Button variant="ghost" className="h-10 text-muted-foreground" disabled={busy} onClick={() => void run(() => q.reopen(share.id), t("charges.reopened"))}>
            <RotateCcw />
            {t("charges.reopen")}
          </Button>
        )}
      </div>
      {rejecting && (
        <ReasonForm
          className="mt-3"
          label={t("charges.rejectLabel")}
          submit={t("charges.reject")}
          onSubmit={(reason) => q.reject(share.id, reason)}
          onCancel={() => setRejecting(false)}
        />
      )}
      {share.paymentReports.length > (pending ? 1 : 0) && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer py-2 text-muted-foreground">{t("charges.history")}</summary>
          <ul className="flex flex-col gap-2">
            {share.paymentReports
              .filter((r) => r !== pending)
              .map((r) => (
                <li key={r.id}>
                  <ReportLine report={r} />
                </li>
              ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function ReportLine({ report }: { report: ChargeShare["paymentReports"][number] }) {
  const { t } = useTranslation();
  return (
    <div className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm">
      <p>
        {t(`charges.reportStatus.${report.status}`, {
          name: report.reportedBy.name ?? report.reportedBy.email,
          date: report.paidOn ? formatDate(report.paidOn) : formatDateTime(report.createdAt),
        })}
      </p>
      {report.note && <p className="mt-1 text-muted-foreground">»{report.note}«</p>}
      {report.rejectReason && <p className="mt-1 text-destructive">{report.rejectReason}</p>}
      <Files files={report.attachments} />
    </div>
  );
}

function Files({ files }: { files: Attachment[] }) {
  if (!files.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {files.map((f) => (
        <li key={f.id}>
          <a
            href={apiUrl(f.url)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-medium hover:border-primary/50"
          >
            <FileText className="size-4 text-primary" aria-hidden="true" />
            <span className="max-w-48 truncate">{f.fileName}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function ReasonForm({
  label,
  submit,
  onSubmit,
  onCancel,
  className,
}: {
  label: string;
  submit: string;
  onSubmit: (reason: string | null) => Promise<void>;
  onCancel: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const save = useAsyncAction(async () => {
    await onSubmit(reason.trim() || null);
    onCancel();
  });
  return (
    <form
      className={`flex flex-col gap-3 rounded-xl border bg-card p-4 ${className ?? ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        void save.run();
      }}
    >
      <Field label={label}>{(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="min-h-20" autoFocus />}</Field>
      <FormError message={save.error} />
      <div className="flex gap-2">
        <Button type="submit" className="h-11 flex-1" disabled={save.pending}>
          {save.pending && <Loader2 className="animate-spin" />}
          {submit}
        </Button>
        <Button type="button" variant="ghost" className="h-11" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
