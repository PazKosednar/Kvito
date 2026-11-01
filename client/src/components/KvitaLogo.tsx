import { cn } from "@/lib/utils";
import { KvitaLockup, KvitaMark } from "./brand";

interface KvitaLogoProps {
  className?: string;
  /** Lockup (mark + wordmark) instead of the mark alone. */
  withWordmark?: boolean;
  size?: "sm" | "md";
}

/** Official Kvito logo from the CGP. Colors follow the theme (and `.on-panel`). */
export function KvitaLogo({ className, withWordmark = false, size = "md" }: KvitaLogoProps) {
  if (withWordmark) return <KvitaLockup className={cn(size === "sm" ? "h-6" : "h-8", className)} />;
  return <KvitaMark className={cn(size === "sm" ? "size-6" : "size-8", className)} title="Kvito" />;
}
