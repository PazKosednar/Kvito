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
  /**
   * Things that move (cars, walkers, tractor, sheep). Drawn in a separate light overlay <svg> on top, so their
   * animation repaints only that overlay and not the whole town (smooth on phones).
   */
  moving: ReactNode[];
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
 * Moves its children along the world x axis by `dx`. "loop": drives through and fades in/out at the ends
 * (.kv-drive); "shuttle": back and forth with easing (.kv-shuttle). CSS animations, so they pause with
 * prefers-reduced-motion. `phase` (0–1) spreads several movers along their way.
 */
function Mover({ dx, seconds, phase, mode = "loop", children }: { dx: number; seconds: number; phase: number; mode?: "loop" | "shuttle"; children: ReactNode }) {
  const style = {
    "--kv-dx": `${(dx * C).toFixed(2)}px`,
    "--kv-dy": `${(dx / 2).toFixed(2)}px`,
    animationDuration: `${seconds}s`,
    animationDelay: `${(-seconds * phase).toFixed(2)}s`,
  } as CSSProperties;
  return (
    <g className={mode === "loop" ? "kv-drive" : "kv-shuttle"} style={style}>
      {children}
    </g>
  );
}

/** A small walking person (line art) at world x, y; bobs gently while walking. */
function Walker({ x, y, step }: { x: number; y: number; step: number }) {
  const [gx, gy] = proj([x, y, 0]);
  return (
    <g className="kv-bob" style={{ animationDuration: `${step}s` }} stroke={EDGE} strokeLinecap="round">
      <line x1={gx - 1} y1={gy} x2={gx} y2={gy - 3.4} />
      <line x1={gx + 1} y1={gy} x2={gx} y2={gy - 3.4} />
      <line x1={gx} y1={gy - 3.4} x2={gx} y2={gy - 7.2} />
      <line x1={gx - 1.5} y1={gy - 4.6} x2={gx + 1.5} y2={gy - 5.8} />
      <circle cx={gx} cy={gy - 8.8} r={1.5} fill={FILL} />
    </g>
  );
}

/** A small dog trotting next to its owner. */
function Dog({ x, y }: { x: number; y: number }) {
  const [gx, gy] = proj([x, y, 0]);
  return (
    <g className="kv-bob" style={{ animationDuration: "0.32s" }} stroke={EDGE} strokeLinecap="round">
      <line x1={gx - 1.6} y1={gy} x2={gx - 1.4} y2={gy - 2} />
      <line x1={gx + 1.4} y1={gy} x2={gx + 1.6} y2={gy - 2} />
      <ellipse cx={gx} cy={gy - 2.6} rx={2.4} ry={1.1} fill={FILL} />
      <circle cx={gx + 2.6} cy={gy - 3.6} r={1} fill={FILL} />
    </g>
  );
}

/** Tractor (line art): body, cab, a big rear and a small front wheel, exhaust. */
function Tractor({ x, y }: { x: number; y: number }) {
  const [rx, ry] = proj([x + 7, y + 5.2, 3]);
  const [fx, fy] = proj([x + 1.5, y + 5.2, 1.7]);
  const [ex, ey] = proj([x + 2, y + 2.5, 4.5]);
  return (
    <g>
      <Box x={x} y={y} z={1.5} w={10} d={5} h={3} />
      <Box x={x + 5.5} y={y} z={4.5} w={4.5} d={5} h={4.5} />
      <line x1={ex} y1={ey} x2={ex} y2={ey - 4} stroke={EDGE} strokeLinecap="round" />
      <circle cx={rx} cy={ry} r={3.2} fill={FILL} stroke={EDGE} />
      <circle cx={rx} cy={ry} r={1} fill="none" stroke={FAINT} />
      <circle cx={fx} cy={fy} r={1.7} fill={FILL} stroke={EDGE} />
    </g>
  );
}

/** Grazing sheep: woolly body, dark head, two legs. */
function Sheep({ x, y }: { x: number; y: number }) {
  const [gx, gy] = proj([x, y, 0]);
  return (
    <g stroke={EDGE} strokeLinecap="round">
      <line x1={gx - 1.4} y1={gy} x2={gx - 1.4} y2={gy - 1.8} />
      <line x1={gx + 1.4} y1={gy} x2={gx + 1.4} y2={gy - 1.8} />
      <ellipse cx={gx} cy={gy - 3.2} rx={3.2} ry={2} fill={FILL} />
      <ellipse cx={gx + 3.3} cy={gy - 2.6} rx={1.2} ry={0.9} className="fill-ink-on-panel-muted" stroke="none" />
    </g>
  );
}

/**
 * True when an item standing `dy` in front of the row at `x` would cover a building's index label
 * (labels sit at the front-right corner of each building's plot).
 */
function nearLabel(r: TownRow, x: number, dy: number) {
  const labels = [...r.gaps.map((g) => g.x0), r.x1 + 6];
  return labels.some((lx) => Math.abs(x - (lx + dy - 6)) < 13);
}

const lineX = (x0: number, x1: number, y: number, z = 0) => pts([[x0, y, z], [x1, y, z]]);

// ---------- Scenes ----------

function park(rows: TownRow[], L: SceneLayers) {
  for (const r of rows) {
    const rnd = seeded(`park-${r.index}`);
    // Calm and sparse: a few trees behind, one tree per gap, a path with benches and an even row of trees in front.
    const back: ReactNode[] = [];
    for (let x = r.x0 - 6, i = 0; x <= r.x1 + 8; x += 44, i++) {
      const jx = x + (rnd() - 0.5) * 6;
      back.push(i % 2 ? <Pine key={`b${i}`} x={jx} y={r.y0 - 14} /> : <Tree key={`b${i}`} x={jx} y={r.y0 - 14} />);
    }
    L.back.set(r.index, back);
    for (const g of r.gaps) L.gap.set(g.after, [<Tree key="t" x={(g.x0 + g.x1) / 2} y={r.y0 + (r.y1 - r.y0) * 0.35} s={0.85} />]);
    const front: ReactNode[] = [
      // Gravel path along the front.
      <polyline key="p1" points={lineX(r.x0 - 16, r.x1 + 16, r.y1 + 12)} fill="none" stroke={FAINT} />,
      <polyline key="p2" points={lineX(r.x0 - 16, r.x1 + 16, r.y1 + 20)} fill="none" stroke={FAINT} />,
    ];
    for (let x = r.x0 + 10, i = 0; x <= r.x1 - 6; x += 72, i++) if (!nearLabel(r, x, 22)) front.push(<Bench key={`be${i}`} x={x} y={r.y1 + 22} />);
    for (let x = r.x0 + 14, i = 0; x <= r.x1 + 14; x += 46, i++) if (!nearLabel(r, x, 32)) front.push(<Tree key={`ft${i}`} x={x} y={r.y1 + 32} s={0.8} />);
    L.front.set(r.index, front);
    // People strolling along the path in both directions (one with a dog); slow, spread out.
    const px0 = r.x0 - 16;
    const len = r.x1 - r.x0 + 32;
    const walk = (len / 9) | 0; // ~9 world units per second
    L.moving.push(
      <Mover key={`w1-${r.index}`} dx={len} seconds={walk} phase={0.1}>
        <Walker x={px0} y={r.y1 + 15} step={0.5} />
      </Mover>,
      <Mover key={`w2-${r.index}`} dx={len} seconds={walk * 1.25} phase={0.6}>
        <Walker x={px0} y={r.y1 + 15} step={0.56} />
        <Dog x={px0 + 4} y={r.y1 + 15} />
      </Mover>,
      <Mover key={`w3-${r.index}`} dx={-len} seconds={walk * 1.1} phase={0.35}>
        <Walker x={px0 + len} y={r.y1 + 18} step={0.52} />
      </Mover>,
    );
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
    for (let x = r.x0 - 6, i = 0; x <= r.x1 + 6; x += 48, i++) if (!nearLabel(r, x, 10)) front.push(<Lamp key={`lp${i}`} x={x} y={curbA - 2} />);
    // Traffic: near lane drives right, far lane drives left; drawn near lane first (it is further back).
    const len = x1 - x0 - 14;
    const near = 16 + Math.round(rnd() * 4);
    const far = 20 + Math.round(rnd() * 4);
    L.front.set(r.index, front);
    L.moving.push(
      <Mover key={`c1-${r.index}`} dx={len} seconds={near} phase={0.15}>
        <Car x={x0} y={curbA + 3} />
      </Mover>,
      <Mover key={`c2-${r.index}`} dx={len} seconds={near} phase={0.65}>
        <Car x={x0} y={curbA + 3} />
      </Mover>,
      <Mover key={`c3-${r.index}`} dx={-len} seconds={far} phase={0.35}>
        <Car x={x1 - 14} y={curbA + 15} />
      </Mover>,
      <Mover key={`c4-${r.index}`} dx={-len} seconds={far} phase={0.85}>
        <Car x={x1 - 14} y={curbA + 15} />
      </Mover>,
    );
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
    // Parcels in front: ploughed fields (one with a tractor going back and forth) and a fenced pasture with sheep.
    let tractor = false;
    for (let x = fx0, i = 0; x <= fx1 - 20; i++) {
      const w = Math.min(34 + Math.round(rnd() * 18), fx1 - x);
      const pasture = i % 3 === 1;
      front.push(<polygon key={`f${i}`} points={pts([[x, y0, 0], [x + w, y0, 0], [x + w, y1, 0], [x, y1, 0]])} fill="none" stroke={pasture ? EDGE : FAINT} />);
      if (pasture) {
        for (let k = 0; k < 6; k++) {
          const [gx, gy] = proj([x + 4 + rnd() * (w - 8), y0 + 3 + rnd() * (y1 - y0 - 6), 0]);
          front.push(<path key={`g${i}-${k}`} d={`M${gx - 1},${gy}l1,-2l1,2`} fill="none" stroke={FAINT} />);
        }
        const flock = Math.min(4, Math.max(2, Math.floor(w / 12)));
        for (let k = 0; k < flock; k++) {
          const sx = x + 6 + ((w - 14) * (k + 0.5)) / flock;
          const sy = y0 + 6 + ((k * 7) % (y1 - y0 - 10));
          L.moving.push(
            <Mover key={`s${r.index}-${i}-${k}`} dx={3 + (k % 2) * 2} seconds={7 + k * 1.7} phase={k * 0.3} mode="shuttle">
              <Sheep x={sx} y={sy} />
            </Mover>,
          );
        }
      } else if (i % 2 === 0) {
        for (let y = y0 + 4; y < y1; y += 4) front.push(<polyline key={`f${i}-${y}`} points={lineX(x + 2, x + w - 2, y)} fill="none" stroke={FAINT} />);
        if (!tractor && w >= 30) {
          tractor = true;
          L.moving.push(
            <Mover key={`t${r.index}`} dx={w - 16} seconds={9 + w / 8} phase={0.2} mode="shuttle">
              <Tractor x={x + 3} y={(y0 + y1) / 2 - 2.5} />
            </Mover>,
          );
        }
      } else for (let px = x + 4; px < x + w; px += 5) front.push(<polyline key={`f${i}-${px}`} points={pts([[px, y0 + 2, 0], [px, y1 - 2, 0]])} fill="none" stroke={FAINT} />);
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
  const L: SceneLayers = { back: new Map(), gap: new Map(), front: new Map(), extent: [], moving: [] };
  if (scene === "park") park(rows, L);
  else if (scene === "city") city(rows, L);
  else if (scene === "countryside") countryside(rows, L);
  return L;
}
