import { cn } from "@/lib/utils";

/**
 * Isometric line-art building blocks. A cube = one obligation; outlined cubes are open,
 * the filled accent cube is the settled one ("Kvita ✓").
 */

const C = Math.cos(Math.PI / 6); // 0.866

function cubePaths(x: number, y: number, a: number) {
  const top = `M${x},${y - a} L${x + a * C},${y - a / 2} L${x},${y} L${x - a * C},${y - a / 2} Z`;
  const left = `M${x - a * C},${y - a / 2} L${x},${y} L${x},${y + a} L${x - a * C},${y + a / 2} Z`;
  const right = `M${x},${y} L${x + a * C},${y - a / 2} L${x + a * C},${y + a / 2} L${x},${y + a} Z`;
  return { top, left, right };
}

export function IsoCube({ x, y, a, filled = false, className }: { x: number; y: number; a: number; filled?: boolean; className?: string }) {
  const p = cubePaths(x, y, a);
  if (filled) {
    return (
      <g className={className}>
        <path d={p.top} fill="var(--primary)" />
        <path d={p.left} fill="color-mix(in oklab, var(--primary) 78%, black)" />
        <path d={p.right} fill="color-mix(in oklab, var(--primary) 60%, black)" />
        <path d={`M${x - a * 0.28},${y - a * 0.5} l${a * 0.18},${a * 0.12} l${a * 0.36},-${a * 0.24}`} fill="none" stroke="#fff" strokeWidth={a * 0.07} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    );
  }
  return (
    <g className={className} fill="var(--background)" stroke="currentColor" strokeWidth="1" strokeLinejoin="round">
      <path d={p.left} />
      <path d={p.right} />
      <path d={p.top} />
    </g>
  );
}

/** Hero scene: an orbit of open obligations around the settled one, with small mono callouts. */
export function IsoScene({ className, labels }: { className?: string; labels: [string, string, string] }) {
  return (
    <svg viewBox="0 0 420 320" className={cn("text-muted-foreground", className)} role="img" aria-hidden="true">
      <ellipse cx="210" cy="178" rx="170" ry="78" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeDasharray="3 5" className="animate-dash" />
      <ellipse cx="210" cy="178" rx="96" ry="44" fill="none" stroke="currentColor" strokeOpacity="0.25" />
      <line x1="210" y1="40" x2="210" y2="300" stroke="currentColor" strokeOpacity="0.25" />

      <IsoCube x={92} y={150} a={34} />
      <IsoCube x={330} y={128} a={30} />
      <IsoCube x={300} y={232} a={36} />
      <IsoCube x={128} y={244} a={24} />

      <g className="animate-float">
        <IsoCube x={210} y={150} a={52} filled />
      </g>

      {/* Callouts */}
      <g fontFamily="var(--font-mono)" fontSize="9" letterSpacing="0.6" fill="currentColor">
        <line x1="92" y1="116" x2="92" y2="84" stroke="currentColor" strokeOpacity="0.6" />
        <rect x="64" y="70" width="80" height="14" fill="var(--foreground)" />
        <text x="68" y="80" fill="var(--background)">{labels[0]}</text>
        <line x1="330" y1="98" x2="330" y2="66" stroke="currentColor" strokeOpacity="0.6" />
        <rect x="300" y="52" width="86" height="14" fill="var(--foreground)" />
        <text x="304" y="62" fill="var(--background)">{labels[1]}</text>
        <line x1="300" y1="268" x2="300" y2="292" stroke="currentColor" strokeOpacity="0.6" />
        <rect x="270" y="292" width="92" height="14" fill="var(--foreground)" />
        <text x="274" y="302" fill="var(--background)">{labels[2]}</text>
      </g>
    </svg>
  );
}

/** Greyscale pixel mosaic used as quiet decoration at the edge of a frame. */
export function Mosaic({ className }: { className?: string }) {
  // Fixed pattern (opacity steps) – deterministic, no randomness between renders.
  const cells = [0, 2, 0, 0, 3, 0, 1, 4, 2, 0, 0, 1, 2, 5, 3, 1, 0, 2, 4, 6, 5, 2, 1, 3];
  return (
    <div aria-hidden="true" className={cn("grid grid-cols-8", className)}>
      {cells.map((v, i) => (
        <span key={i} className="aspect-square bg-foreground" style={{ opacity: v * 0.07 }} />
      ))}
    </div>
  );
}
