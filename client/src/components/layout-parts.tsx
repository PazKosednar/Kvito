import { ChevronLeft, ChevronRight, Loader2, RotateCw } from "lucide-react";
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
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: string;
  action?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-6">
      {back && (
        <Link
          to={back}
          className="-ml-2 mb-3 inline-flex h-10 items-center gap-1 rounded-md px-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {t("common.back")}
        </Link>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-title font-medium text-balance">{title}</h1>
          {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

/** A titled block of a screen. Sections are separated by space, not boxes. */
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
        <div className="mb-3 flex items-center justify-between gap-3">
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
  return <ul className={cn("divide-y rounded-xl border bg-card", className)}>{children}</ul>;
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
        <span className="block truncate font-semibold">{title}</span>
        {subtitle && <span className="mt-0.5 block text-sm text-muted-foreground">{subtitle}</span>}
      </span>
      {trailing}
      {(to || onClick) && <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
    </>
  );
  const cls = "flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left";
  return (
    <li>
      {to ? (
        <Link to={to} className={cn(cls, "hover:bg-muted/60")}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={cn(cls, "hover:bg-muted/60")}>
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
    <dl className="divide-y rounded-xl border bg-card">
      {items.map((it, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-muted-foreground">{it.label}</dt>
          <dd className="text-right font-medium">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LoadingState() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 py-10 text-muted-foreground" role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      {t("common.loading")}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="py-8" role="alert">
      <p className="text-destructive">{message}</p>
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
    <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
      {message}
    </p>
  );
}
