import { cn } from "@/lib/utils";

interface KvitaStampProps {
  className?: string;
  /** Play the one-time settle-in animation (respects reduced motion). */
  animate?: boolean;
}

/** "Kvita ✓" – the settled state. A sharp accent tag with a filled cube, in the interface's grid language. */
export function KvitaStamp({ className, animate = false }: KvitaStampProps) {
  return (
    <span
      role="img"
      aria-label="Kvita ✓"
      className={cn(
        "inline-flex items-center gap-2 bg-primary px-3 py-2 text-primary-foreground",
        animate && "animate-stamp",
        className,
      )}
    >
      <svg viewBox="0 0 20 20" className="size-4 shrink-0" aria-hidden="true">
        <path d="M10 1 L18 5.5 L10 10 L2 5.5 Z" fill="currentColor" />
        <path d="M2 5.5 L10 10 L10 19 L2 14.5 Z" fill="currentColor" opacity="0.7" />
        <path d="M10 10 L18 5.5 L18 14.5 L10 19 Z" fill="currentColor" opacity="0.45" />
      </svg>
      <span className="font-mono text-xs font-semibold tracking-[0.08em] uppercase">Kvita ✓</span>
    </span>
  );
}
