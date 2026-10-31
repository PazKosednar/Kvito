import { ArrowRight, ChevronLeft, Loader2, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Screen title with an optional back link and trailing action. */
export function PageHeader({
  title,
  subtitle,
  back,
  action,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: string;
  action?: ReactNode;
  /** Mono label above the title (section number / context). */
  eyebrow?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-8">
      {back && (
        <Link
          to={back}
          className="-ml-2 mb-4 inline-flex h-9 items-center gap-1 rounded-sm px-2 font-mono text-xs tracking-[0.06em] text-muted-foreground uppercase hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {t("common.back")}
        </Link>
      )}
      {eyebrow && <p className="label-mono mb-2">{eyebrow}</p>}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-title font-semibold text-balance lg:text-h1">{title}</h1>
          {subtitle && <p className="mt-2 max-w-[56ch] text-muted-foreground">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

/** A titled block of a screen. Sections are separated by space and a mono label, not boxes. */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-10 first:mt-0", className)}>
      {(title || action) && (
        <div className="mb-3 flex min-h-9 items-center justify-between gap-3">
          {title && <h2 className="label-mono">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Divided list of rows on a single surface. */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("divide-y divide-line overflow-hidden rounded-md border border-line bg-surface-raised", className)}>{children}</ul>;
}

export function ListRow({
  to,
  onClick,
  title,
  subtitle,
  leading,
  trailing,
}: {
  to?: string;
  onClick?: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const body = (
    <>
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        {subtitle && <span className="mt-0.5 block text-sm text-muted-foreground">{subtitle}</span>}
      </span>
      {trailing}
      {(to || onClick) && (
        <ArrowRight
          className="size-4 shrink-0 text-ink-faint transition-colors duration-150 group-hover:text-primary"
          aria-hidden="true"
        />
      )}
    </>
  );
  const cls = "group flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors";
  return (
    <li>
      {to ? (
        <Link to={to} className={cn(cls, "hover:bg-surface-sunken")}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={cn(cls, "hover:bg-surface-sunken")}>
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

/** Label/value pairs (terms of a tenancy, payment data). */
export function Facts({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-line rounded-md border border-line bg-surface-raised">
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,10rem)_1fr] items-baseline gap-4 px-4 py-3">
          <dt className="label-mono">{it.label}</dt>
          <dd className="text-right font-medium">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Mono "loading" line with a blinking block cursor. */
export function LoadingState() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 py-10 text-ink-faint" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span className="label-mono">{t("common.loading")}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="border border-destructive/40 p-5" role="alert">
      <p className="label-mono text-danger">{t("common.errorLabel")}</p>
      <p className="mt-2">{message}</p>
      {onRetry && (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          <RotateCw />
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="border-l-2 border-destructive bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
      {message}
    </p>
  );
}
