import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/**
 * CGP Button: primary = accent fill (one per view), secondary = bordered, ghost = text only.
 * Sizes: sm 32 · default 40 · lg/xl 48 (mobile tap target). Radius 4px, never pill. Color transitions only.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-sm border border-transparent text-sm font-medium whitespace-nowrap transition-colors duration-150 ease-out outline-none disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:brightness-[1.08]",
        destructive: "bg-danger text-white hover:brightness-[1.08] dark:text-surface",
        outline: "border-line-strong bg-surface-raised text-ink hover:border-ink",
        secondary: "border-line-strong bg-surface-raised text-ink hover:border-ink",
        ghost: "text-ink hover:bg-surface-sunken",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4",
        xs: "h-6 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 text-[13px]",
        lg: "h-12 px-6 text-[15px]",
        // Primary mobile action – thumb-sized (CGP control-lg).
        xl: "h-12 px-6 text-[15px]",
        icon: "size-10",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
