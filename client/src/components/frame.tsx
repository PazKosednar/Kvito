import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { Eyebrow } from "./brand";
import { IsoGlyph, type GlyphName } from "./iso";

/**
 * Module tile (CGP card): surface-raised, 1px line, radius 6, no shadow. The illustration sits on the 24px
 * decorative grid; on hover/focus its accent face fades in (opacity only) and the border darkens.
 */
export function ModuleTile({
  glyph,
  label,
  index,
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
  index?: ReactNode;
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
      <div className="kv-grid-bg relative rounded-t-md border-b border-line bg-surface">
        <IsoGlyph name={glyph} className="mx-auto h-28 w-full max-w-56" />
        <IsoGlyph
          name={glyph}
          lit
          className="absolute inset-0 mx-auto h-28 w-full max-w-56 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <Eyebrow index={index}>{label}</Eyebrow>
        {title && <p className="text-h3 font-semibold">{title}</p>}
        {body && <p className="text-sm text-ink-muted">{body}</p>}
        <div className="mt-auto flex items-center justify-between pt-3">
          <span>{trailing}</span>
          {(to || onClick) && (
            <ArrowRight className="size-4 text-ink-faint transition-colors duration-150 group-hover:text-primary" aria-hidden="true" />
          )}
        </div>
      </div>
    </>
  );
  const cls = cn(
    "group relative flex flex-col rounded-md border border-line bg-surface-raised text-left transition-colors duration-150 hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-45",
    className,
  );
  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} disabled={disabled} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

/** Summary on the panel (CGP: panel is for hero, summaries and "Kvito ✓"). */
export function PanelSummary({
  eyebrow,
  items,
  action,
}: {
  eyebrow: ReactNode;
  items: { label: ReactNode; value: ReactNode; tone?: "default" | "warn" | "signal" }[];
  action?: ReactNode;
}) {
  return (
    <section className="on-panel kv-grid-panel rounded-md p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow onPanel>{eyebrow}</Eyebrow>
        {action}
      </div>
      <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {items.map((it, i) => (
          <div key={i} className="border-t border-ink-on-panel/15 pt-3">
            <dt className="font-mono text-[11px] leading-4 font-medium tracking-[0.08em] text-ink-on-panel-muted uppercase">{it.label}</dt>
            <dd
              className={cn(
                "amount mt-1",
                it.tone === "warn" && "text-[var(--warn-on-panel)]",
                it.tone === "signal" && "text-signal",
              )}
            >
              {it.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
