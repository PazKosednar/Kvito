import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { IsoGlyph, type GlyphName } from "./iso";

/** "+" registration mark placed on grid intersections. */
export function Crosshair({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 11 11" aria-hidden="true" className={cn("pointer-events-none absolute size-[11px] text-muted-foreground/60", className)}>
      <path d="M5.5 0 V11 M0 5.5 H11" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

/** Corner marks for a framed block. */
export function FrameCorners() {
  return (
    <>
      <Crosshair className="-top-[6px] -left-[6px]" />
      <Crosshair className="-top-[6px] -right-[6px]" />
      <Crosshair className="-bottom-[6px] -left-[6px]" />
      <Crosshair className="-right-[6px] -bottom-[6px]" />
    </>
  );
}

/**
 * Module tile: a bordered cell with an isometric illustration, a mono label and one sentence –
 * the building block of overview screens. The illustration lights up on hover/focus.
 */
export function ModuleTile({
  glyph,
  label,
  title,
  body,
  to,
  onClick,
  disabled,
  trailing,
  className,
}: {
  glyph: GlyphName;
  label: ReactNode;
  title?: ReactNode;
  body?: ReactNode;
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
  trailing?: ReactNode;
  className?: string;
}) {
  const inner = (
    <>
      <div className="relative border-b bg-background/40">
        <IsoGlyph name={glyph} className="mx-auto h-28 w-full max-w-56 group-hover:[&_.fill-background]:fill-card group-focus-visible:[&_.fill-background]:fill-card" />
        <IsoGlyph
          name={glyph}
          lit
          className="absolute inset-0 mx-auto h-28 w-full max-w-56 opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <p className="label-mono flex items-center gap-2 text-foreground">{label}</p>
        {title && <p className="text-lg leading-tight font-medium tracking-[-0.02em]">{title}</p>}
        {body && <p className="text-sm text-muted-foreground">{body}</p>}
        <div className="mt-auto flex items-center justify-between pt-3">
          <span>{trailing}</span>
          {(to || onClick) && (
            <ArrowRight className="size-4 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-primary" aria-hidden="true" />
          )}
        </div>
      </div>
    </>
  );
  const cls = cn(
    "group relative flex flex-col border bg-card text-left transition-colors hover:border-foreground/25 focus-visible:border-primary disabled:opacity-60",
    className,
  );
  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} disabled={disabled} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

/** Grid of figures: bordered cells, mono label on top, big tabular number below. */
export function StatGrid({ items }: { items: { label: ReactNode; value: ReactNode; tone?: "default" | "danger" | "accent" }[] }) {
  return (
    <dl className="relative grid grid-cols-2 border-t border-l sm:grid-cols-3">
      <FrameCorners />
      {items.map((it, i) => (
        <div key={i} className="flex min-h-24 flex-col justify-between border-r border-b p-4">
          <dt className="label-mono">{it.label}</dt>
          <dd
            className={cn(
              "tabular mt-3 text-2xl font-medium tracking-[-0.03em]",
              it.tone === "danger" && "text-destructive",
              it.tone === "accent" && "text-primary",
            )}
          >
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
