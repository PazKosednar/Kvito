import { useTranslation } from "react-i18next";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Login hero illustration: an isometric apartment house in 1 px wireframe (CGP "Ilustracije"),
 * one flat lit in signal green, with blueprint-style callouts for what Kvito manages
 * (rent, meters, handover, messages). Drawn for the always-dark panel; transparent background
 * so the panel grid shows through.
 */

const C = Math.cos(Math.PI / 6);
const OX = 250;
const OY = 200;
const W = 120; // x – front-right face
const D = 80; // y – front-left face
const H = 150; // wall height, 3 floors of 50
const R = 40; // roof rise

const EDGE = "#4a4a50";
const GRID = "#232327";

const p = (x: number, y: number, z: number) => `${(OX + (x - y) * C).toFixed(1)},${(OY + (x + y) * 0.5 - z).toFixed(1)}`;
const poly = (...pts: [number, number, number][]) => `M${pts.map((q) => p(...q)).join(" L")} Z`;
/** Rectangle on the front-left wall (plane y = D). */
const onLeft = (x0: number, x1: number, z0: number, z1: number) => poly([x0, D, z0], [x1, D, z0], [x1, D, z1], [x0, D, z1]);
/** Rectangle on the front-right wall (plane x = W). */
const onRight = (y0: number, y1: number, z0: number, z1: number) => poly([W, y0, z0], [W, y1, z0], [W, y1, z1], [W, y0, z1]);
const xy = (x: number, y: number, z: number) => p(x, y, z).split(",").map(Number) as [number, number];

const LEFT_WINDOWS: [number, number, number, number][] = [
  [51, 69, 14, 36],
  [90, 108, 14, 36],
  [12, 30, 62, 84],
  [90, 108, 62, 84],
  [12, 30, 112, 134],
  [51, 69, 112, 134],
  [90, 108, 112, 134],
];
const LIT: [number, number, number, number] = [51, 69, 62, 84];
const RIGHT_WINDOWS: [number, number, number, number][] = [
  [58, 72, 14, 36],
  [10, 28, 62, 84],
  [52, 70, 62, 84],
  [10, 28, 112, 134],
  [52, 70, 112, 134],
];

function Grid() {
  const lines = [];
  for (let y = -40; y <= 140; y += 20) lines.push(<path key={`y${y}`} d={`M${p(-60, y, 0)} L${p(200, y, 0)}`} />);
  for (let x = -60; x <= 200; x += 20) lines.push(<path key={`x${x}`} d={`M${p(x, -40, 0)} L${p(x, 140, 0)}`} />);
  return (
    <g stroke={GRID} strokeWidth="1" mask="url(#kv-scene-fade)">
      {lines}
    </g>
  );
}

function Callout({ from, elbow, to, label, anchor = "start" }: { from: [number, number]; elbow: [number, number]; to: [number, number]; label: string; anchor?: "start" | "end" }) {
  return (
    <g>
      <polyline points={[from, elbow, to].map((q) => q.join(",")).join(" ")} fill="none" stroke={EDGE} strokeWidth="1" />
      <circle cx={from[0]} cy={from[1]} r="2.5" fill="#a8a69f" />
      <text
        x={to[0] + (anchor === "start" ? 6 : -6)}
        y={to[1] + 3.5}
        textAnchor={anchor}
        className="fill-ink-on-panel-muted font-mono"
        fontSize="10"
        letterSpacing="0.08em"
      >
        {label.toUpperCase()}
      </text>
    </g>
  );
}

export function ApartmentScene({ className }: { className?: string }) {
  const { t } = useTranslation();
  const lit = xy((LIT[0] + LIT[1]) / 2, D, (LIT[2] + LIT[3]) / 2);
  const door = xy(W, 40, 18);
  const meter = xy(19, D, 22);
  const msg = xy(W, 19, 123);

  return (
    <svg viewBox="0 0 480 360" aria-hidden="true" className={cn("h-auto w-full select-none", className)}>
      <defs>
        <radialGradient id="kv-scene-fade-g" cx="52%" cy="72%" r="55%">
          <stop offset="0.55" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
        <mask id="kv-scene-fade">
          <rect width="480" height="360" fill="url(#kv-scene-fade-g)" />
        </mask>
      </defs>

      <Grid />

      <g stroke={EDGE} strokeWidth="1" strokeLinejoin="round" fill="var(--panel)">
        {/* Back roof slope (mostly hidden), walls, openings, gable and front slope – painter's order. */}
        <path d={poly([0, 0, H], [W, 0, H], [W, D / 2, H + R], [0, D / 2, H + R])} />
        <path d={poly([0, D, H], [W, D, H], [W, D, 0], [0, D, 0])} />
        <path d={poly([W, 0, H], [W, D, H], [W, D, 0], [W, 0, 0])} />
        {/* Floor lines. */}
        <path d={`M${p(0, D, 50)} L${p(W, D, 50)} L${p(W, 0, 50)} M${p(0, D, 100)} L${p(W, D, 100)} L${p(W, 0, 100)}`} fill="none" strokeOpacity="0.5" />
        {LEFT_WINDOWS.map((w) => (
          <path key={w.join()} d={onLeft(...w)} />
        ))}
        {RIGHT_WINDOWS.map((w) => (
          <path key={w.join()} d={onRight(...w)} />
        ))}
        {/* Entrance with a small canopy. */}
        <path d={onRight(31, 49, 0, 34)} />
        <path d={poly([W, 28, 38], [W, 52, 38], [W + 10, 52, 38], [W + 10, 28, 38])} />
        {/* Meter cabinet on the ground floor. */}
        <path d={onLeft(12, 26, 14, 30)} />
        <path d={`M${p(14, D, 22)} L${p(24, D, 22)}`} fill="none" />
        <path d={poly([W, 0, H], [W, D, H], [W, D / 2, H + R])} />
        <path d={poly([0, D / 2, H + R], [W, D / 2, H + R], [W, D, H], [0, D, H])} />
      </g>

      {/* The settled flat. */}
      <path d={onLeft(...LIT)} className="fill-signal stroke-signal" strokeWidth="1" strokeLinejoin="round" />

      <Callout from={meter} elbow={[150, 262]} to={[118, 262]} label={t("login.scene.meters")} anchor="end" />
      <Callout from={door} elbow={[362, 300]} to={[374, 300]} label={t("login.scene.handover")} />
      <Callout from={msg} elbow={[378, 112]} to={[392, 112]} label={t("login.scene.messages")} />

      {/* Floating rent card for the lit flat. */}
      <polyline points={`${lit.join(",")} 196,146 172,146`} fill="none" stroke="var(--signal)" strokeWidth="1" />
      <circle cx={lit[0]} cy={lit[1]} r="2.5" className="fill-signal" />
      <g>
        <rect x="14" y="106" width="158" height="80" rx="6" fill="#161618" stroke={EDGE} strokeWidth="1" />
        <text x="28" y="127" className="fill-ink-on-panel-muted font-mono" fontSize="9.5" letterSpacing="0.08em">
          {t("login.scene.flat").toUpperCase()}
        </text>
        <text x="28" y="152" className="fill-ink-on-panel" fontSize="20" fontWeight="600" letterSpacing="-0.01em">
          {formatCents(65000)}
        </text>
        <circle cx="34" cy="169" r="6" className="fill-signal" />
        <polyline points="31,169 33.3,171.3 37.2,166.8" fill="none" stroke="var(--panel)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <text x="46" y="173" className="fill-signal" fontSize="11.5" fontWeight="500">
          {t("login.scene.settled")}
        </text>
      </g>
    </svg>
  );
}
