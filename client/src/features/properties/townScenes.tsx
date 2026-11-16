import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import type { DayTime, Season } from "./townAmbient";
import { C, proj, pts, seeded, type Pt, type TownRow } from "./townGeometry";

/** Time of day and season for everything drawn in the town (trees, lamps, roofs, windows). */
export const TownAmbientContext = createContext<{ dayTime: DayTime; season: Season }>({ dayTime: "day", season: "summer" });
const useAmbient = () => useContext(TownAmbientContext);

/**
 * Surroundings for the property town (a per-device choice, see useTownScene).
 * Pure decoration in CGP line art: thin neutral lines, no green (green means "settled"), no interaction.
 * Each scene returns layers so the painter's order stays right: behind a row, between its buildings, in front of it.
 */

export type TownScene = "none" | "park" | "city" | "countryside";
export const TOWN_SCENES: TownScene[] = ["none", "park", "city", "countryside"];

export interface SceneLayers {
  /** Per row: drawn before the row's buildings. */
  back: Map<number, ReactNode[]>;
  /** Per building index: drawn right after that building (fills the gap to its right). */
  gap: Map<number, ReactNode[]>;
  /** Per row: drawn after the row's buildings. */
  front: Map<number, ReactNode[]>;
  /** Extra world points the canvas must include. */
  extent: Pt[];
}

const EDGE = "var(--panel-edge)";
const FAINT = "var(--panel-edge-faint)";
const FILL = "var(--panel)";

// ---------- Elements ----------

/** Deciduous tree by season: blossom in spring, full crown in summer, sparse crown and fallen leaves in autumn, bare in winter. */
export function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const { season } = useAmbient();
  const [gx, gy] = proj([x, y, 0]);
  const [tx, ty] = proj([x, y, 9 * s]);
  const cy = ty - 6 * s;
  const r = 7 * s;
  if (season === "winter") {
    return (
      <g>
        <ellipse cx={gx} cy={gy} rx={6 * s} ry={3 * s} fill="var(--snow)" stroke={FAINT} />
        <line x1={gx} y1={gy} x2={tx} y2={cy - r * 0.6} stroke={EDGE} />
        <polyline points={`${tx - r * 0.8},${cy - r * 0.5} ${tx},${ty} ${tx + r * 0.8},${cy - r * 0.7}`} fill="none" stroke={EDGE} strokeLinejoin="round" />
        <polyline points={`${tx - r * 0.5},${cy - r * 0.9} ${tx},${cy - r * 0.1} ${tx + r * 0.45},${cy - r * 1.05}`} fill="none" stroke={EDGE} strokeLinejoin="round" />
      </g>
    );
  }
  return (
    <g>
      <ellipse cx={gx} cy={gy} rx={6 * s} ry={3 * s} fill="none" stroke={FAINT} />
      {season === "autumn" &&
        [-5, -2, 2, 5.5].map((dx, i) => <circle key={i} cx={gx + dx * s} cy={gy + (i % 2 ? 1.2 : -0.8) * s} r={0.9} fill={EDGE} />)}
      <line x1={gx} y1={gy} x2={tx} y2={ty} stroke={EDGE} />
      <circle cx={tx} cy={cy} r={r} fill={FILL} stroke={EDGE} strokeDasharray={season === "autumn" ? "3 2" : undefined} />
      {season === "spring" &&
        [
          [-3, -2],
          [2.5, -3.5],
          [3, 1.5],
          [-1, 3],
          [0, -0.5],
        ].map(([dx, dy], i) => <circle key={i} cx={tx + dx! * s} cy={cy + dy! * s} r={1} fill="none" stroke={EDGE} />)}
    </g>
  );
}

function Pine({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const winter = useAmbient().season === "winter";
  const [gx, gy] = proj([x, y, 0]);
  const top = gy - 26 * s;
  return (
    <g>
      <ellipse cx={gx} cy={gy} rx={5 * s} ry={2.5 * s} fill="none" stroke={FAINT} />
      <line x1={gx} y1={gy} x2={gx} y2={gy - 5 * s} stroke={EDGE} />
      <polygon points={`${gx - 7 * s},${gy - 5 * s} ${gx},${top + 8 * s} ${gx + 7 * s},${gy - 5 * s}`} fill={FILL} stroke={EDGE} strokeLinejoin="round" />
      <polygon points={`${gx - 5 * s},${gy - 13 * s} ${gx},${top} ${gx + 5 * s},${gy - 13 * s}`} fill={FILL} stroke={EDGE} strokeLinejoin="round" />
      {winter && <polygon points={`${gx - 2.4 * s},${top + 5 * s} ${gx},${top} ${gx + 2.4 * s},${top + 5 * s}`} fill="var(--snow)" stroke={EDGE} strokeLinejoin="round" />}
    </g>
  );
}

/** Low bush: a cluster of three small crowns. */
export function Shrub({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const winter = useAmbient().season === "winter";
  const [cx, cy] = proj([x, y, 0]);
  if (s !== 1) {
    return (
      <g fill={winter ? "var(--snow)" : FILL} stroke={EDGE}>
        <circle cx={cx - 2.2 * s} cy={cy - 2 * s} r={2.2 * s} />
        <circle cx={cx + 2.2 * s} cy={cy - 2 * s} r={2.2 * s} />
        <circle cx={cx} cy={cy - 3.6 * s} r={2.4 * s} />
      </g>
    );
  }
  return (
    <g fill={winter ? "var(--snow)" : FILL} stroke={EDGE}>
      <circle cx={cx - 3.5} cy={cy - 3} r={3.2} />
      <circle cx={cx + 3.5} cy={cy - 3} r={3.2} />
      <circle cx={cx} cy={cy - 5.5} r={3.6} />
    </g>
  );
}

function Bench({ x, y }: { x: number; y: number }) {
  return (
    <g fill={FILL} stroke={EDGE} strokeLinejoin="round">
      <polygon points={pts([[x, y, 6], [x + 10, y, 6], [x + 10, y, 3], [x, y, 3]])} />
      <polygon points={pts([[x, y, 3], [x + 10, y, 3], [x + 10, y + 3, 3], [x, y + 3, 3]])} />
      <polyline points={pts([[x + 1, y + 3, 3], [x + 1, y + 3, 0]])} fill="none" />
      <polyline points={pts([[x + 9, y + 3, 3], [x + 9, y + 3, 0]])} fill="none" />
    </g>
  );
}

function Lamp({ x, y }: { x: number; y: number }) {
  const night = useAmbient().dayTime === "night";
  const [gx, gy] = proj([x, y, 0]);
  const [tx, ty] = proj([x, y, 20]);
  return (
    <g>
      {night && (
        <>
          <ellipse cx={gx + 4} cy={gy + 1} rx={9} ry={4.5} fill="var(--night-glow)" opacity={0.7} />
          <circle cx={tx + 4.5} cy={ty + 3} r={6} fill="var(--night-glow)" opacity={0.8} />
        </>
      )}
      <line x1={gx} y1={gy} x2={tx} y2={ty} stroke={EDGE} />
      <line x1={tx} y1={ty} x2={tx + 4} y2={ty + 1.5} stroke={EDGE} />
      <circle cx={tx + 4.5} cy={ty + 3} r={1.8} className={night ? "fill-ink-on-panel stroke-[var(--panel-edge)]" : "fill-ink-on-panel-muted"} />
    </g>
  );
}

/** Isometric box (front face y = y + d, right face x = x + w, top). */
function Box({ x, y, z = 0, w, d, h, faint = false }: { x: number; y: number; z?: number; w: number; d: number; h: number; faint?: boolean }) {
  const stroke = faint ? FAINT : EDGE;
  return (
    <g fill={FILL} stroke={stroke} strokeLinejoin="round">
      <polygon points={pts([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]])} />
      <polygon points={pts([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]])} />
      <polygon points={pts([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]])} />
    </g>
  );
}

function Car({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <Box x={x} y={y} z={1} w={14} d={7} h={3} />
      <Box x={x + 3} y={y + 0.5} z={4} w={7} d={6} h={3} />
    </g>
  );
}

/**
 * A car driving along the road (x direction) from `x` by `dx`, looping. CSS animation (.kv-drive) so it stops
 * with prefers-reduced-motion; fades in and out at the ends of the road. `phase` (0–1) spreads cars along the lane.
 */
function DrivingCar({ x, y, dx, seconds, phase }: { x: number; y: number; dx: number; seconds: number; phase: number }) {
  const style = {
    "--kv-dx": `${(dx * C).toFixed(1)}px`,
    "--kv-dy": `${(dx / 2).toFixed(1)}px`,
    animationDuration: `${seconds}s`,
    animationDelay: `${(-seconds * phase).toFixed(2)}s`,
  } as CSSProperties;
  return (
    <g className="kv-drive" style={style}>
      <Car x={x} y={y} />
    </g>
  );
}

const lineX = (x0: number, x1: number, y: number, z = 0) => pts([[x0, y, z], [x1, y, z]]);

// ---------- Scenes ----------

function park(rows: TownRow[], L: SceneLayers) {
  for (const r of rows) {
    const rnd = seeded(`park-${r.index}`);
    const back: ReactNode[] = [];
    for (let x = r.x0 - 8, i = 0; x <= r.x1 + 8; x += 26, i++) {
      const jx = x + (rnd() - 0.5) * 8;
      const jy = r.y0 - 14 - rnd() * 6;
      back.push(i % 3 === 1 ? <Pine key={`b${i}`} x={jx} y={jy} /> : <Tree key={`b${i}`} x={jx} y={jy} s={0.9 + rnd() * 0.25} />);
    }
    L.back.set(r.index, back);
    for (const g of r.gaps) {
      const mid = (g.x0 + g.x1) / 2;
      L.gap.set(g.after, [<Tree key="t" x={mid} y={r.y0 + (r.y1 - r.y0) * 0.35} s={0.85} />, <Shrub key="s" x={mid - 2} y={r.y1 - 2} />]);
    }
    const front: ReactNode[] = [
      // Gravel path along the front.
      <polyline key="p1" points={lineX(r.x0 - 16, r.x1 + 16, r.y1 + 12)} fill="none" stroke={FAINT} />,
      <polyline key="p2" points={lineX(r.x0 - 16, r.x1 + 16, r.y1 + 20)} fill="none" stroke={FAINT} />,
    ];
    for (let x = r.x0 + 10, i = 0; x <= r.x1 - 6; x += 64, i++) front.push(<Bench key={`be${i}`} x={x} y={r.y1 + 22} />);
    for (let x = r.x0 - 4, i = 0; x <= r.x1 + 10; x += 34, i++) {
      const jx = x + 20 + (rnd() - 0.5) * 10;
      front.push(i % 2 ? <Shrub key={`fs${i}`} x={jx} y={r.y1 + 32} /> : <Tree key={`ft${i}`} x={jx} y={r.y1 + 34} s={0.8} />);
    }
    L.front.set(r.index, front);
    L.extent.push([r.x0 - 22, r.y0 - 22, 0], [r.x1 + 22, r.y0 - 22, 0], [r.x0 - 22, r.y1 + 40, 0], [r.x1 + 22, r.y1 + 40, 0], [r.x0, r.y0 - 20, 34]);
  }
}

function city(rows: TownRow[], L: SceneLayers) {
  for (const r of rows) {
    const rnd = seeded(`city-${r.index}`);
    // Skyline behind: faint taller blocks.
    const back: ReactNode[] = [];
    for (let x = r.x0 - 14, i = 0; x <= r.x1 + 6; i++) {
      const w = 20 + Math.round(rnd() * 12);
      back.push(<Box key={`k${i}`} x={x} y={r.y0 - 30} w={w} d={16} h={30 + Math.round(rnd() * 34)} faint />);
      x += w + 6;
    }
    L.back.set(r.index, back);
    for (const g of r.gaps) L.gap.set(g.after, [<Lamp key="l" x={(g.x0 + g.x1) / 2} y={r.y1 - 4} />]);
    const curbA = r.y1 + 12;
    const curbB = r.y1 + 38;
    const x0 = r.x0 - 24;
    const x1 = r.x1 + 24;
    const front: ReactNode[] = [
      <polyline key="sw" points={lineX(x0, x1, r.y1 + 8)} fill="none" stroke={FAINT} />,
      <polyline key="ca" points={lineX(x0, x1, curbA)} fill="none" stroke={EDGE} />,
      <polyline key="cl" points={lineX(x0, x1, (curbA + curbB) / 2)} fill="none" stroke={FAINT} strokeDasharray="6 5" />,
      <polyline key="cb" points={lineX(x0, x1, curbB)} fill="none" stroke={EDGE} />,
    ];
    // Crosswalk in the middle.
    const cx = (r.x0 + r.x1) / 2;
    for (let i = 0; i < 5; i++) {
      front.push(<polyline key={`z${i}`} points={pts([[cx + i * 4, curbA + 2, 0], [cx + i * 4, curbB - 2, 0]])} fill="none" stroke={FAINT} strokeWidth="2" />);
    }
    for (let x = r.x0 - 6, i = 0; x <= r.x1 + 6; x += 48, i++) front.push(<Lamp key={`lp${i}`} x={x} y={curbA - 2} />);
    // Traffic: near lane drives right, far lane drives left; drawn near lane first (it is further back).
    const len = x1 - x0 - 14;
    const near = 16 + Math.round(rnd() * 4);
    const far = 20 + Math.round(rnd() * 4);
    front.push(<DrivingCar key="c1" x={x0} y={curbA + 3} dx={len} seconds={near} phase={0.15} />);
    front.push(<DrivingCar key="c2" x={x0} y={curbA + 3} dx={len} seconds={near} phase={0.65} />);
    front.push(<DrivingCar key="c3" x={x1 - 14} y={curbA + 15} dx={-len} seconds={far} phase={0.35} />);
    front.push(<DrivingCar key="c4" x={x1 - 14} y={curbA + 15} dx={-len} seconds={far} phase={0.85} />);
    L.front.set(r.index, front);
    L.extent.push([x0, r.y0 - 32, 0], [x1, r.y0 - 32, 0], [x0, curbB + 4, 0], [x1, curbB + 4, 0], [r.x0, r.y0 - 30, 66]);
  }
}

function countryside(rows: TownRow[], L: SceneLayers) {
  for (const r of rows) {
    const rnd = seeded(`country-${r.index}`);
    // A few trees behind the row (visible between and beside the buildings).
    const back: ReactNode[] = [];
    for (let x = r.x0 - 10, i = 0; x <= r.x1 + 10; x += 46, i++) back.push(<Tree key={`b${i}`} x={x + (rnd() - 0.5) * 12} y={r.y0 - 14} s={1.05} />);
    L.back.set(r.index, back);
    for (const g of r.gaps) L.gap.set(g.after, [<Tree key="t" x={(g.x0 + g.x1) / 2} y={r.y0 + (r.y1 - r.y0) * 0.4} s={0.9} />]);
    // Wooden fence along the front, fields beyond it.
    const fx0 = r.x0 - 10;
    const fx1 = r.x1 + 10;
    const fy = r.y1 + 10;
    const front: ReactNode[] = [];
    const y0 = fy + 8;
    const y1 = fy + 30;
    for (let x = fx0, i = 0; x <= fx1 - 20; i++) {
      const w = Math.min(34 + Math.round(rnd() * 18), fx1 - x);
      front.push(<polygon key={`f${i}`} points={pts([[x, y0, 0], [x + w, y0, 0], [x + w, y1, 0], [x, y1, 0]])} fill="none" stroke={FAINT} />);
      if (i % 2 === 0) for (let y = y0 + 4; y < y1; y += 4) front.push(<polyline key={`f${i}-${y}`} points={lineX(x + 2, x + w - 2, y)} fill="none" stroke={FAINT} />);
      else for (let px = x + 4; px < x + w; px += 5) front.push(<polyline key={`f${i}-${px}`} points={pts([[px, y0 + 2, 0], [px, y1 - 2, 0]])} fill="none" stroke={FAINT} />);
      x += w + 6;
    }
    front.push(
      <polyline key="r1" points={lineX(fx0, fx1, fy, 2.5)} fill="none" stroke={EDGE} />,
      <polyline key="r2" points={lineX(fx0, fx1, fy, 5.5)} fill="none" stroke={EDGE} />,
    );
    for (let x = fx0, i = 0; x <= fx1; x += 9, i++) front.push(<polyline key={`po${i}`} points={pts([[x, fy, 0], [x, fy, 7]])} fill="none" stroke={EDGE} />);
    front.push(<Tree key="e1" x={fx0 - 8} y={y1 - 6} s={1.1} />, <Tree key="e2" x={fx1 + 10} y={y0 + 2} s={0.95} />);
    L.front.set(r.index, front);
    L.extent.push([fx0 - 18, r.y0 - 22, 0], [fx1 + 18, r.y0 - 22, 0], [fx0 - 18, y1 + 4, 0], [fx1 + 18, y1 + 4, 0], [r.x0, r.y0 - 14, 30]);
  }
}

export function sceneLayers(scene: TownScene, rows: TownRow[]): SceneLayers {
  const L: SceneLayers = { back: new Map(), gap: new Map(), front: new Map(), extent: [] };
  if (scene === "park") park(rows, L);
  else if (scene === "city") city(rows, L);
  else if (scene === "countryside") countryside(rows, L);
  return L;
}
