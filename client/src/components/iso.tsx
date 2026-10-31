import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Isometric line-art system. Everything is drawn from the same 30° projection so illustrations read as one family.
 * Outlined = open / neutral; the accent fill = settled or "the thing you're looking at".
 */

const C = Math.cos(Math.PI / 6); // 0.866

/** Projects an isometric (x, y, z) box corner to 2D: x → right-down, y → left-down, z → up. */
const P = (ox: number, oy: number) => (x: number, y: number, z: number) => [ox + (x - y) * C, oy + (x + y) * 0.5 - z] as const;

function boxFaces(ox: number, oy: number, w: number, d: number, h: number) {
  const p = P(ox, oy);
  const pt = (x: number, y: number, z: number) => p(x, y, z).join(",");
  return {
    top: `M${pt(0, 0, h)} L${pt(w, 0, h)} L${pt(w, d, h)} L${pt(0, d, h)} Z`,
    left: `M${pt(0, d, h)} L${pt(w, d, h)} L${pt(w, d, 0)} L${pt(0, d, 0)} Z`,
    right: `M${pt(w, 0, h)} L${pt(w, d, h)} L${pt(w, d, 0)} L${pt(w, 0, 0)} Z`,
  };
}

/** A box. `accent` fills it with the brand color (shaded faces), otherwise it's a line drawing. */
export function IsoBox({
  ox,
  oy,
  w,
  d,
  h,
  accent = false,
  className,
}: {
  ox: number;
  oy: number;
  w: number;
  d: number;
  h: number;
  accent?: boolean;
  className?: string;
}) {
  const f = boxFaces(ox, oy, w, d, h);
  return (
    <g className={cn("transition-colors duration-500", className)} strokeLinejoin="round">
      <path d={f.left} className={accent ? "fill-[var(--iso-left)] stroke-signal" : "fill-surface stroke-line-strong"} strokeWidth="1" />
      <path d={f.right} className={accent ? "fill-[var(--iso-right)] stroke-signal" : "fill-surface stroke-line-strong"} strokeWidth="1" />
      <path d={f.top} className={accent ? "fill-signal stroke-signal" : "fill-surface stroke-line-strong"} strokeWidth="1" />
    </g>
  );
}

/** Legacy helper (cube centred at x,y with edge a) – used by the hero scene. */
export function IsoCube({ x, y, a, filled = false, className }: { x: number; y: number; a: number; filled?: boolean; className?: string }) {
  return (
    <g className={className}>
      <IsoBox ox={x} oy={y - a} w={a} d={a} h={a} accent={filled} />
      {filled && (
        <path
          d={`M${x - a * 0.26},${y - a * 0.48} l${a * 0.17},${a * 0.11} l${a * 0.34},-${a * 0.22}`}
          fill="none"
          stroke="#fff"
          strokeWidth={a * 0.07}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </g>
  );
}

/** Faint isometric diamond lattice behind an illustration. */
function Lattice() {
  return (
    <g className="stroke-grid" strokeWidth="1">
      {Array.from({ length: 9 }, (_, i) => (
        <g key={i}>
          <line x1={-60 + i * 40} y1={0} x2={60 + i * 40 + 120} y2={140} />
          <line x1={260 - i * 40} y1={0} x2={140 - i * 40 - 120} y2={140} />
        </g>
      ))}
    </g>
  );
}

export type GlyphName = "building" | "door" | "slabs" | "cubes" | "chat" | "key" | "gauge" | "wrench";

/**
 * Small isometric illustrations (200×140) for modules. `lit` turns the key element accent-blue
 * (hover/active), with a short transition.
 */
export function IsoGlyph({ name, lit = false, className }: { name: GlyphName; lit?: boolean; className?: string }) {
  let body: ReactNode;
  switch (name) {
    case "building":
      body = (
        <>
          <IsoBox ox={104} oy={64} w={30} d={30} h={58} accent={lit} />
          <IsoBox ox={70} oy={92} w={20} d={20} h={28} />
          {/* Window rows on the tower's front face (x = w), projected like the faces. */}
          <g stroke="currentColor" strokeOpacity="0.55">
            {[12, 24, 36, 48].map((z) => {
              const p = P(104, 64);
              const [x1, y1] = p(30, 5, z);
              const [x2, y2] = p(30, 25, z);
              return <line key={z} x1={x1} y1={y1} x2={x2} y2={y2} className={lit ? "stroke-panel" : undefined} />;
            })}
          </g>
        </>
      );
      break;
    case "door":
      body = (
        <>
          <IsoBox ox={100} oy={40} w={48} d={48} h={56} />
          {(() => {
            // Door on the front face (x = w): y from 16 to 32, z from 0 to 32.
            const p = P(100, 40);
            const pts = [p(48, 16, 0), p(48, 32, 0), p(48, 32, 32), p(48, 16, 32)].map((q) => q.join(",")).join(" L");
            const [kx, ky] = p(48, 28, 15);
            return (
              <>
                <path d={`M${pts} Z`} className={lit ? "fill-signal stroke-none" : "fill-none stroke-current"} strokeWidth="1" />
                <circle cx={kx} cy={ky} r="1.6" className={lit ? "fill-panel" : "fill-current"} />
              </>
            );
          })()}
        </>
      );
      break;
    case "slabs":
      body = (
        <>
          <IsoBox ox={100} oy={86} w={56} d={40} h={6} />
          <IsoBox ox={100} oy={70} w={56} d={40} h={6} />
          <IsoBox ox={100} oy={54} w={56} d={40} h={6} accent={lit} />
        </>
      );
      break;
    case "cubes":
      body = (
        <>
          <IsoBox ox={72} oy={70} w={26} d={26} h={26} />
          <IsoBox ox={130} oy={58} w={26} d={26} h={26} />
          <IsoBox ox={100} oy={48} w={30} d={30} h={30} accent={lit} />
          <ellipse cx="100" cy="98" rx="70" ry="26" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeDasharray="2 4" />
        </>
      );
      break;
    case "chat":
      body = (
        <>
          <IsoBox ox={88} oy={52} w={46} d={30} h={26} accent={lit} />
          <IsoBox ox={128} oy={82} w={34} d={22} h={18} />
          <path d="M70,98 l-10,14 l18,-6" fill="none" stroke="currentColor" />
        </>
      );
      break;
    case "key":
      body = (
        <>
          <ellipse cx="74" cy="70" rx="20" ry="11" fill="none" stroke="currentColor" />
          <ellipse cx="74" cy="66" rx="20" ry="11" className={lit ? "fill-signal" : "fill-surface stroke-current"} strokeWidth="1" />
          <path d="M92,72 L150,101 M132,92 l0,9 M142,97 l0,9" fill="none" stroke="currentColor" strokeWidth="2" />
        </>
      );
      break;
    case "gauge":
      body = (
        <>
          <IsoBox ox={100} oy={44} w={40} d={40} h={46} />
          <ellipse cx="117" cy="88" rx="11" ry="7" className={lit ? "fill-signal" : "fill-none stroke-current"} strokeWidth="1" />
        </>
      );
      break;
    case "wrench":
      body = (
        <>
          <IsoBox ox={100} oy={78} w={60} d={34} h={10} />
          <path d="M78,58 l50,26" stroke="currentColor" strokeWidth="5" strokeLinecap="round" className={lit ? "stroke-signal" : undefined} />
          <circle cx="74" cy="56" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
        </>
      );
      break;
  }
  return (
    <svg viewBox="0 0 200 140" aria-hidden="true" className={cn("text-line-strong", className)}>
      <Lattice />
      {body}
    </svg>
  );
}
