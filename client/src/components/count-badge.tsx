import { cn } from "@/lib/utils";

/** "Something new" count (CGP: pill shapes only for status dots and toggles). The accessible name is given by the caller. */
export function CountBadge({ count, label, className }: { count: number; label: string; className?: string }) {
  return (
    <span
      {...(label ? { "aria-label": label } : { "aria-hidden": true })}
      className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 font-mono text-[10px] font-medium text-primary-foreground", className)}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
