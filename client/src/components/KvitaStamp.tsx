import { useId } from "react";
import { cn } from "@/lib/utils";

interface KvitaStampProps {
  className?: string;
  /** Play the one-time "stamp lands" animation (respects reduced motion). */
  animate?: boolean;
}

/**
 * "Kvita ✓" as a rubber stamp in violet stamp ink – shown when a tenancy has every obligation confirmed.
 * The ink texture is an SVG turbulence mask so the stamp looks pressed, not printed.
 */
export function KvitaStamp({ className, animate = false }: KvitaStampProps) {
  const filterId = `kvita-ink-${useId().replace(/:/g, "")}`;
  return (
    <svg
      viewBox="0 0 168 72"
      role="img"
      aria-label="Kvita ✓"
      className={cn("text-stamp", animate ? "animate-stamp" : "-rotate-8", className)}
    >
      <defs>
        <filter id={filterId} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.6"
            result="speckle"
          />
          <feComposite in="SourceGraphic" in2="speckle" operator="in" />
        </filter>
      </defs>
      <g filter={`url(#${filterId})`} fill="none" stroke="currentColor">
        <rect x="3" y="3" width="162" height="66" rx="10" strokeWidth="4" />
        <rect x="10" y="10" width="148" height="52" rx="6" strokeWidth="1.5" />
        <text
          x="72"
          y="47"
          textAnchor="middle"
          fill="currentColor"
          stroke="none"
          fontFamily="inherit"
          fontSize="30"
          fontWeight="800"
          letterSpacing="0.5"
        >
          Kvita
        </text>
        {/* Drawn check mark – a font glyph would fall back to "√" in many fonts. */}
        <path d="M118 36 L126 44 L141 26" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
