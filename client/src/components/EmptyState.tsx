import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body: string;
  /** The next step – an empty screen is an invitation to act. */
  action?: ReactNode;
}

/** Placeholder for lists without data yet (Phase 1+). Left-aligned, quiet, always points to the next step. */
export function EmptyState({ icon: Icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-3 py-6">
      <Icon className="size-8 text-primary" aria-hidden="true" />
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-[46ch] text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}
