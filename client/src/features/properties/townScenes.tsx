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

// ---------- City skyline landmarks (background, faint lines) ----------

/** Iso ellipse (a circle on the ground plane at height z), as world points. */
const ring = (cx: number, cy: number, rx: number, ry: number, z: number, from = 0, to = Math.PI * 2, n = 36): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / n;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, z] as Pt;
  });

/** Tall tower: base, a narrower set-back top, horizontal floor bands, antenna with a light at night. */
function Tower({ x, y, h }: { x: number; y: number; h: number }) {
  const night = useAmbient().dayTime === "night";
  const w = 16;
  const d = 14;
  const top = Math.round(h * 0.78);
  const [ax, ay] = proj([x + w / 2, y + d / 2, h + 4]);
  const [bx, by] = proj([x + w / 2, y + d / 2, h + 22]);
  return (
    <g>
      <Box x={x} y={y} w={w} d={d} h={top} faint />
      <Box x={x + 3} y={y + 3} z={top} w={w - 6} d={d - 6} h={h - top} faint />
      <Box x={x + w / 2 - 2} y={y + d / 2 - 2} z={h} w={4} d={4} h={4} faint />
      {Array.from({ length: Math.floor(top / 9) - 1 }, (_, i) => (
        <g key={i} stroke={FAINT} fill="none">
          <polyline points={pts([[x + 2, y + d, 9 * (i + 1)], [x + w - 2, y + d, 9 * (i + 1)]])} />
          <polyline points={pts([[x + w, y + 2, 9 * (i + 1)], [x + w, y + d - 2, 9 * (i + 1)]])} />
        </g>
      ))}
      <line x1={ax} y1={ay} x2={bx} y2={by} stroke={FAINT} />
      {night && <circle cx={bx} cy={by} r={4} fill="var(--night-glow)" opacity={0.9} />}
      <circle cx={bx} cy={by} r={1.4} className={night ? "fill-ink-on-panel" : "fill-ink-on-panel-muted"} />
    </g>
  );
}

/** Stadium: an oval bowl with the pitch inside and four floodlight masts (lit at night). */
function Stadium({ cx, cy, rx, ry }: { cx: number; cy: number; rx: number; ry: number }) {
  const night = useAmbient().dayTime === "night";
  const h = 12;
  // Front half of the outer wall (angles 0..π face the viewer in this projection: +y is towards the viewer).
  const frontBottom = ring(cx, cy, rx, ry, 0, -Math.PI / 4, (Math.PI * 5) / 4);
  const frontTop = ring(cx, cy, rx, ry, h, -Math.PI / 4, (Math.PI * 5) / 4).reverse();
  const masts: Pt[] = [
    [cx - rx * 0.8, cy - ry * 0.8, 0],
    [cx + rx * 0.8, cy - ry * 0.8, 0],
    [cx - rx * 0.8, cy + ry * 0.8, 0],
    [cx + rx * 0.8, cy + ry * 0.8, 0],
  ];
  const mast = ([mx, my]: Pt, i: number) => {
    const [gx, gy] = proj([mx, my, h]);
    const [tx, ty] = proj([mx, my, h + 22]);
    return (
      <g key={i}>
        <line x1={gx} y1={gy} x2={tx} y2={ty} stroke={FAINT} />
        {night && <ellipse cx={tx} cy={ty} rx={7} ry={4} fill="var(--night-glow)" opacity={0.85} />}
        <rect x={tx - 3.5} y={ty - 2} width={7} height={3} fill={FILL} stroke={FAINT} />
      </g>
    );
  };
  return (
    <g strokeLinejoin="round">
      {masts.slice(0, 2).map(mast)}
      <polygon points={pts(ring(cx, cy, rx, ry, h))} fill={FILL} stroke={FAINT} />
      <polygon points={pts([...frontBottom, ...frontTop])} fill={FILL} stroke={FAINT} />
      {/* Stands: inner rim, then the pitch with halfway line and centre circle. */}
      <polygon points={pts(ring(cx, cy, rx * 0.72, ry * 0.68, h))} fill={FILL} stroke={FAINT} />
      <polygon
        points={pts([[cx - rx * 0.5, cy - ry * 0.42, h], [cx + rx * 0.5, cy - ry * 0.42, h], [cx + rx * 0.5, cy + ry * 0.42, h], [cx - rx * 0.5, cy + ry * 0.42, h]])}
        fill="none"
        stroke={FAINT}
      />
      <polyline points={pts([[cx, cy - ry * 0.42, h], [cx, cy + ry * 0.42, h]])} fill="none" stroke={FAINT} />
      <polygon points={pts(ring(cx, cy, rx * 0.1, ry * 0.12, h, 0, Math.PI * 2, 16))} fill="none" stroke={FAINT} />
      {/* Ribs on the outer wall. */}
      {[0.1, 0.35, 0.6, 0.85].map((f, i) => {
        const a = -Math.PI / 4 + ((Math.PI * 3) / 2) * f;
        const p = [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as const;
        return <polyline key={i} points={pts([[p[0], p[1], 0], [p[0], p[1], h]])} fill="none" stroke={FAINT} />;
      })}
      {masts.slice(2).map((m, i) => mast(m, i + 2))}
    </g>
  );
}

/** Tower crane: lattice mast, jib with trolley and hook, counter-jib with weight. */
function Crane({ x, y, h }: { x: number; y: number; h: number }) {
  const m = 3;
  const jib = 46;
  const back = 14;
  const lines: [Pt, Pt][] = [];
  for (const [dx, dy] of [[0, 0], [m, 0], [m, m], [0, m]] as const) lines.push([[x + dx, y + dy, 0], [x + dx, y + dy, h]]);
  for (let z = 6; z < h; z += 6) lines.push([[x, y + m, z - 6], [x + m, y + m, z]], [[x + m, y, z - 6], [x + m, y + m, z]]);
  const top: Pt = [x + m / 2, y + m / 2, h + 8];
  lines.push(
    [[x - back, y + m / 2, h], [x + m + jib, y + m / 2, h]],
    [[x - back, y + m / 2, h + 2], [x + m + jib, y + m / 2, h + 2]],
    [top, [x + m + jib, y + m / 2, h + 2]],
    [top, [x - back, y + m / 2, h + 2]],
    [[x + m, y + m / 2, h], top],
    [[x + 30, y + m / 2, h], [x + 30, y + m / 2, h - 20]],
  );
  return (
    <g stroke={FAINT} fill="none">
      {lines.map(([a, b], i) => (
        <polyline key={i} points={pts([a, b])} />
      ))}
      <Box x={x - back} y={y - 1} z={h - 5} w={6} d={m + 2} h={5} faint />
      <Box x={x + 28} y={y} z={h - 24} w={4} d={m} h={3} faint />
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
  return labels.some((lx) => Math.abs(x - (lx + dy - 6)) < 20);
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
    // Skyline behind (faint): a stadium further back, then a row of blocks with two towers and a crane.
    const back: ReactNode[] = [];
    const span = r.x1 - r.x0;
    const by = r.y0 - 30;
    if (span > 120) back.push(<Stadium key="stadium" cx={r.x0 + span * 0.62} cy={r.y0 - 92} rx={44} ry={30} />);
    const towerAt = [r.x0 + span * 0.18, r.x0 + span * 0.82];
    const craneAt = r.x0 + span * 0.42;
    let crane = false;
    for (let x = r.x0 - 14, i = 0; x <= r.x1 + 6; i++) {
      const t = towerAt.findIndex((tx) => tx >= x && tx < x + 30);
      if (t >= 0) {
        back.push(<Tower key={`t${i}`} x={x} y={by - 2} h={t === 0 ? 112 : 96} />);
        towerAt.splice(t, 1);
        x += 22;
        continue;
      }
      if (!crane && x >= craneAt) {
        crane = true;
        back.push(<Crane key="crane" x={x + 4} y={by - 6} h={84} />);
        x += 14;
        continue;
      }
      const w = 20 + Math.round(rnd() * 12);
      const h = 26 + Math.round(rnd() * 30);
      back.push(<Box key={`k${i}`} x={x} y={by} w={w} d={16} h={h} faint />);
      if (rnd() > 0.6) back.push(<Box key={`k${i}r`} x={x + w / 2 - 3} y={by + 5} z={h} w={6} d={6} h={5} faint />);
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
    // Far side of the road: a sidewalk and a second row of lamps, staggered by half a step.
    front.push(<polyline key="sw2" points={lineX(x0, x1, curbB + 6)} fill="none" stroke={FAINT} />);
    for (let x = r.x0 + 18, i = 0; x <= r.x1 + 18; x += 48, i++) if (!nearLabel(r, x, 41)) front.push(<Lamp key={`lq${i}`} x={x} y={curbB + 3} />);
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
    L.extent.push([x0, r.y0 - 32, 0], [x1, r.y0 - 32, 0], [x0, curbB + 10, 0], [x1, curbB + 10, 0], [r.x0, r.y0 - 30, 140], [r.x0 + (r.x1 - r.x0) * 0.62, r.y0 - 122, 40]);
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
