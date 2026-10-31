import { cn } from "@/lib/utils";

interface KvitaLogoProps {
  className?: string;
  /** Show the "Kvita" wordmark next to the mark. */
  withWordmark?: boolean;
}

/** Temporary Kvita mark (check mark + key). Same geometry as public/logo.svg; colors come from tokens. */
export function KvitaLogo({ className, withWordmark = false }: KvitaLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 64 64" aria-hidden="true" className="size-9 shrink-0">
        <rect width="64" height="64" rx="14" className="fill-primary" />
        <g
          transform="translate(-2 3)"
          fill="none"
          className="stroke-primary-foreground"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M13 33.5 L25.5 46 L42.5 25.5" />
          <circle cx="48" cy="18.5" r="6.5" />
          <path d="M29.6 41 L33.4 44.2 M33.6 36.2 L37.4 39.4" />
        </g>
      </svg>
      {withWordmark && <span className="text-2xl font-bold tracking-tight text-primary">Kvita</span>}
      {!withWordmark && <span className="sr-only">Kvita</span>}
    </span>
  );
}
