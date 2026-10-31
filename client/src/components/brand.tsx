/**
 * Kvita brand components, implemented from the official CGP (files/cgp/kvita-cgp: components/bundle.js + bundle.css).
 * Same anatomy, labels and tokens; built as React + Tailwind so they share the app's tokens and i18n.
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ChargeStatus } from "@/types/domain";

// ---------- Logo (assets/Logos) ----------

const SHEET = "M4 0 H34 L48 14 V44 A4 4 0 0 1 44 48 H4 A4 4 0 0 1 0 44 V4 A4 4 0 0 1 4 0 Z";

/** The mark: a sheet with a cut corner and a heavy check – "everything is settled". Min. 16 px. */
export function KvitaMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("size-7 shrink-0", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <path d={SHEET} fill="var(--logo-sheet)" />
      <polyline points="12,25 20,33 33,18" fill="none" stroke="var(--logo-check)" strokeWidth="7" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

/** Mark + KVITA wordmark (drawn from straight 8 px strokes). Colors follow the theme or `.on-panel`. Min. width 96 px. */
export function KvitaLockup({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 48" className={cn("h-6 w-auto", className)} role="img" aria-label="Kvita">
      <path d={SHEET} fill="var(--logo-sheet)" />
      <polyline points="12,25 20,33 33,18" fill="none" stroke="var(--logo-check)" strokeWidth="7" strokeLinecap="square" strokeLinejoin="miter" />
      <g transform="translate(64 4)" fill="var(--logo-word)">
        <rect x="0" y="0" width="8" height="40" />
        <polygon points="8,13 19,0 30,0 8,25" />
        <polygon points="12,19 30,40 20,40 7,25" />
        <polygon points="36,0 45,0 52,28 59,0 68,0 57,40 47,40" />
        <rect x="74" y="0" width="8" height="40" />
        <rect x="88" y="0" width="30" height="8" />
        <rect x="99" y="0" width="8" height="40" />
        <polygon points="135,0 145,0 156,40 147,40 140,13 133,40 124,40" />
        <rect x="131" y="25" width="18" height="7" />
      </g>
    </svg>
  );
}

// ---------- Eyebrow ----------

/** Mono uppercase overline. `index` is shown in ink (on a panel: signal), e.g. "01". */
export function Eyebrow({ index, children, className, onPanel = false }: { index?: ReactNode; children?: ReactNode; className?: string; onPanel?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-2 font-mono text-[11px] leading-4 font-medium tracking-[0.08em] uppercase",
        onPanel ? "text-ink-on-panel-muted" : "text-ink-faint",
        className,
      )}
    >
      {index != null && <span className={onPanel ? "text-signal" : "text-ink"}>{index}</span>}
      <span>{children}</span>
    </span>
  );
}

// ---------- StatusBadge ----------

const STATUS_STYLE: Record<ChargeStatus, string> = {
  OPEN: "bg-surface-sunken text-ink-muted",
  REPORTED_PAID: "border-line-strong bg-surface-raised text-ink",
  CONFIRMED: "bg-accent-soft text-primary",
  OVERDUE: "bg-warn-soft text-warn",
  DISPUTED: "bg-danger-soft text-danger",
};

function StatusIcon({ status }: { status: ChargeStatus }) {
  const common = { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "square" as const, strokeLinejoin: "miter" as const, className: "size-3 shrink-0", "aria-hidden": true };
  switch (status) {
    case "OPEN":
      return <svg {...common}><rect x="4.5" y="4.5" width="7" height="7" /></svg>;
    case "REPORTED_PAID":
      return <svg {...common}><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.5l2 1.5" /></svg>;
    case "CONFIRMED":
      return <svg {...common}><path d="M3 8.5l3.2 3.2L13 4.5" /></svg>;
    case "OVERDUE":
      return <svg {...common}><path d="M8 2.5l6 11H2z" /><path d="M8 6.5v3.5M8 11.8v.4" /></svg>;
    case "DISPUTED":
      return <svg {...common}><path d="M4 4l8 8M12 4l-8 8" /></svg>;
  }
}

/** Status always as word + icon, never color alone. */
export function StatusBadge({ status, children, className }: { status: ChargeStatus; children?: ReactNode; className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-xs border border-transparent px-2 font-mono text-[11px] leading-4 font-medium tracking-[0.06em] whitespace-nowrap uppercase",
        STATUS_STYLE[status],
        className,
      )}
    >
      <StatusIcon status={status} />
      {children ?? t(`chargeStatus.${status}`)}
    </span>
  );
}

// ---------- Card shell ----------

export function Card({ children, className, as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" | "li" }) {
  return <Tag className={cn("rounded-md border border-line bg-surface-raised", className)}>{children}</Tag>;
}

// ---------- ChargeCard ----------

export function ChargeCard({
  kind,
  index,
  title,
  meta,
  amountCents,
  due,
  dueLate = false,
  status,
  action,
  className,
}: {
  kind: ReactNode;
  index?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  amountCents: number;
  due?: ReactNode;
  dueLate?: boolean;
  status: ChargeStatus;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Card as="article" className={cn("grid grid-cols-[1fr_auto] gap-x-6 gap-y-4 p-5 sm:p-6", className)}>
      <div className="col-span-2 flex items-center justify-between gap-4 border-b border-line pb-4">
        <Eyebrow index={index}>{kind}</Eyebrow>
        <StatusBadge status={status} />
      </div>
      <div className="min-w-0">
        <h3 className="text-h3 font-semibold">{title}</h3>
        {meta && <p className="mt-1 text-sm text-ink-muted">{meta}</p>}
      </div>
      <div className="amount text-right">{formatCents(amountCents)}</div>
      {(due || action) && (
        <div className="col-span-2 flex items-center justify-between gap-4">
          <span className={cn("mono", dueLate ? "text-warn" : "text-ink-muted")}>{due}</span>
          {action}
        </div>
      )}
    </Card>
  );
}

// ---------- SettledBanner ----------

/** "Kvita ✓" – only when everything is confirmed (never for partially paid months). It simply appears. */
export function SettledBanner({ period, children, className }: { period?: ReactNode; children?: ReactNode; className?: string }) {
  const { t } = useTranslation();
  return (
    <section role="status" className={cn("on-panel kv-grid-panel flex items-center gap-6 rounded-md p-6 sm:p-8", className)}>
      <KvitaMark className="size-14" />
      <div>
        <Eyebrow onPanel>{period ?? t("settled.thisMonth")}</Eyebrow>
        <p className="mt-1 text-title font-semibold">
          Kvita <span className="text-signal">✓</span>
        </p>
        <p className="mt-1 text-sm text-ink-on-panel-muted">{children ?? t("settled.body")}</p>
      </div>
    </section>
  );
}

// ---------- Illustration (assets/Ilustracije) ----------

/** The isometric building of units with one unit in signal green – "your flat is kvita". */
export function UnitsIllustration({ className, onPanel = false }: { className?: string; onPanel?: boolean }) {
  const { resolvedTheme } = useTheme();
  const dark = onPanel || resolvedTheme === "dark";
  return (
    <img
      src={dark ? "/illustrations/kvita-enote-dark.svg" : "/illustrations/kvita-enote-light.svg"}
      alt=""
      aria-hidden="true"
      width={480}
      height={360}
      className={cn("h-auto w-full select-none", className)}
      draggable={false}
    />
  );
}

/** Primary/secondary action helpers matching the CGP Button. */
export { Button };
