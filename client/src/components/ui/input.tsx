import * as React from "react"
import { cn } from "@/lib/utils"

/** CGP Field input: 48px, surface-raised, 1px line-strong, focus = 2px accent ring + ink border. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-sm border border-line-strong bg-surface-raised px-4 text-base text-ink transition-colors duration-150 outline-none placeholder:text-ink-faint disabled:cursor-not-allowed disabled:opacity-45",
        "focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]",
        "aria-invalid:border-danger",
        className
      )}
      {...props}
    />
  )
}

export { Input }
