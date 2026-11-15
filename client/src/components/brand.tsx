/**
 * Kvito brand components, implemented from the official CGP (files/cgp/kvita-cgp: components/bundle.js + bundle.css).
 * Same anatomy, labels and tokens; built as React + Tailwind so they share the app's tokens and i18n.
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ChargeStatus } from "@/types/domain";

// ---------- Logo (assets/Logos, CGP v2) ----------

/** Rounded tile of the mark (48 × 48, radius 10). */
const MARK_TILE = "M10 0H38A10 10 0 0 1 48 10V38A10 10 0 0 1 38 48H10A10 10 0 0 1 0 38V10A10 10 0 0 1 10 0Z";
/** The oversized check of the app icon, clipped to the tile – its long stroke leaves the tile top right. */
const MARK_CHECK =
  "M47.93 8.87 L47.89 8.53 L47.81 8.05 L47.7 7.57 L47.57 7.1 L47.42 6.63 L47.24 6.17 L47.04 5.72 L46.82 5.29 L46.58 4.86 L46.31 4.44 L46.03 4.04 L45.73 3.66 L45.41 3.28 L45.07 2.93 L44.72 2.59 L44.34 2.27 L43.96 1.97 L43.56 1.69 L43.14 1.42 L42.78 1.22 L18.41 27.04 L9.68 18.32 L3.32 24.68 L18.59 39.96Z";
/** Wordmark letters k, i, t, o (drawn, not typeset; 7-unit strokes on a 40-unit height). */
const WORD_LETTERS =
  "M7 0 L0 0 L0 40 L7 40 L7 34.5 L10.53 30.43 L18.5 40 L27.5 40 L14.91 25.38 L26.5 12 L17.5 12 L7 24Z M75 12 L75 40 L68 40 L68 12Z M75 0 L75 7 L68 7 L68 0Z M98 19 L98 12 L90 12 L90 2 L83 2 L83 12 L78 12 L78 19 L83 19 L83 40 L90 40 L90 19Z M101 26a14 14 0 1 0 28 0a14 14 0 1 0 -28 0Z M108 26a7 7 0 1 1 14 0a7 7 0 1 1 -14 0Z";
/** The "v" of the wordmark is a check – "everything is settled". */
const WORD_CHECK = "M42.1 39.89 L62.87 10 L57.13 6 L41.9 27.91 L34.81 18.41 L29.19 22.59Z";

/** The mark: a rounded tile with the oversized check of the app icon. For small spaces (loader, banner, avatar). Min. 16 px. */
export function KvitaMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("size-7 shrink-0", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <path d={MARK_TILE} fill="var(--logo-sheet)" />
      <path d={MARK_CHECK} fill="var(--logo-check)" />
    </svg>
  );
}

/** The logo: lowercase "kvito" wordmark whose "v" is a check. Colors follow the theme or `.on-panel`. Min. height 16 px. */
export function KvitaLockup({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 129 40" className={cn("h-6 w-auto", className)} role="img" aria-label="Kvito">
      <path d={WORD_LETTERS} fill="var(--logo-word)" fillRule="evenodd" />
      <path d={WORD_CHECK} fill="var(--logo-accent)" />
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

export const STATUS_STYLE: Record<ChargeStatus, string> = {
  OPEN: "bg-surface-sunken text-ink-muted",
  REPORTED_PAID: "border-line-strong bg-surface-raised text-ink",
  CONFIRMED: "bg-accent-soft text-primary",
  OVERDUE: "bg-warn-soft text-warn",
  DISPUTED: "bg-danger-soft text-danger",
};

export function StatusIcon({ status, className = "size-3 shrink-0" }: { status: ChargeStatus; className?: string }) {
  const common = { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "square" as const, strokeLinejoin: "miter" as const, className, "aria-hidden": true };
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

/** "Kvito ✓" – only when everything is confirmed (never for partially paid months). It simply appears. */
export function SettledBanner({ period, children, className }: { period?: ReactNode; children?: ReactNode; className?: string }) {
  const { t } = useTranslation();
  return (
    <section role="status" className={cn("on-panel kv-grid-panel flex items-center gap-6 rounded-md p-6 sm:p-8", className)}>
      <KvitaMark className="size-14" />
      <div>
        <Eyebrow onPanel>{period ?? t("settled.thisMonth")}</Eyebrow>
        <p className="mt-1 text-title font-semibold">
          Kvito <span className="text-signal">✓</span>
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
