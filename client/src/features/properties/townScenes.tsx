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
  /** Deep backdrop behind the first row (hills, landmarks), drawn before everything else, deepest first. */
  far: ReactNode[];
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

function Pine({ x, y, z = 0, s = 1 }: { x: number; y: number; z?: number; s?: number }) {
  const winter = useAmbient().season === "winter";
  const [gx, gy] = proj([x, y, z]);
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
  return (
    <Drift sx={dx * C} sy={dx / 2} seconds={seconds} phase={phase} mode={mode}>
      {children}
    </Drift>
  );
}

/** Like Mover, but by a screen offset (sx, sy) – for things in the sky or moving up a slope. */
function Drift({ sx, sy, seconds, phase, mode = "loop", children }: { sx: number; sy: number; seconds: number; phase: number; mode?: "loop" | "shuttle"; children: ReactNode }) {
  const style = {
    "--kv-dx": `${sx.toFixed(2)}px`,
    "--kv-dy": `${sy.toFixed(2)}px`,
    animationDuration: `${seconds}s`,
    animationDelay: `${(-seconds * phase).toFixed(2)}s`,
  } as CSSProperties;
  return (
    <g className={mode === "loop" ? "kv-drive" : "kv-shuttle"} style={style}>
      {children}
    </g>
  );
}

/** Slow rotation around its own centre (ferris wheel, klopotec, mill wheel); the content must be symmetric. */
function Spin({ seconds, reverse = false, children }: { seconds: number; reverse?: boolean; children: ReactNode }) {
  return (
    <g className="kv-spin" style={{ animationDuration: `${seconds}s`, animationDirection: reverse ? "reverse" : undefined }}>
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
    // One tower on the left; the right side stays low so the stadium behind it is in view.
    const towerAt = [r.x0 + span * 0.18];
    const stadium: [number, number] | null = span > 120 ? [r.x0 + span * 0.62 - 50, r.x0 + span * 0.62 + 50] : null;
    const craneAt = r.x0 + span * 0.42;
    let crane = false;
    for (let x = r.x0 - 14, i = 0; x <= r.x1 + 6; i++) {
      const t = towerAt.findIndex((tx) => tx >= x && tx < x + 30);
      if (t >= 0) {
        back.push(<Tower key={`t${i}`} x={x} y={by - 2} h={112} />);
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
      const low = stadium != null && x + w > stadium[0] && x < stadium[1];
      const h = low ? 18 + Math.round(rnd() * 8) : 26 + Math.round(rnd() * 30);
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
  const L: SceneLayers = { back: new Map(), gap: new Map(), front: new Map(), far: [], extent: [], moving: [] };
  if (rows.length === 0) return L;
  // The deep backdrop needs a row of a few buildings; a single home (the tenant's view) would be dwarfed by it.
  const deep = Math.max(...rows.map((r) => r.x1 - r.x0)) >= 120;
  if (scene === "park") {
    park(rows, L);
    if (deep) parkBackdrop(rows, L);
  } else if (scene === "city") {
    city(rows, L);
    if (deep) cityBackdrop(rows, L);
  } else if (scene === "countryside") {
    countryside(rows, L);
    if (deep) countryBackdrop(rows, L);
  }
  return L;
}


// ---------- Deep backdrop: several layers behind the first row ----------
//
// Placement: `B.at(f, D, z)` is the world point in the same screen column as the fraction f (0 = left end,
// 1 = right end) of the first row's back edge, D world units further back, at height z. Everything stays behind
// the landlord's own buildings; deeper layers rise higher and are drawn with lighter lines. The left part of the
// sky stays free for the sun and moon, so the deepest layers sit towards the right, where the canvas has room.

interface Backdrop {
  at: (f: number, D: number, z?: number) => Pt;
  /** Screen x of the fraction f on the first row. */
  sx: (f: number) => number;
}

function backdrop(rows: TownRow[]): Backdrop {
  const X0 = Math.min(...rows.map((r) => r.x0));
  const X1 = Math.max(...rows.map((r) => r.x1));
  const Y0 = rows[0]!.y0;
  const W = Math.max(X1 - X0, 200);
  const XM = (X0 + X1) / 2;
  const at = (f: number, D: number, z = 0): Pt => [XM + (f - 0.5) * W - D, Y0 - D, z];
  return { at, sx: (f) => proj(at(f, 0))[0] };
}

/**
 * Reserves the sky lane above everything pushed to the extent so far (and buildings up to `tallest`);
 * returns its screen y. Call after the backdrop's own extent points.
 */
function skyLane(B: Backdrop, L: SceneLayers, tallest: number, room = 18): number {
  const top = Math.min(...L.extent.map((p) => proj(p)[1]), proj(B.at(0, 0, tallest))[1]);
  const y = top - 6;
  // A world point above the middle of the row whose screen y is the top of the lane.
  const [x, w] = B.at(0.5, 0);
  L.extent.push([x, w, proj([x, w, 0])[1] - (y - room)]);
  return y;
}

/** Layer tone: deeper layers get lighter lines (fills stay opaque, so they still hide what is behind). */
function Layer({ depth, children }: { depth: "near" | "mid" | "far"; children: ReactNode }) {
  return <g strokeOpacity={depth === "far" ? 0.5 : depth === "mid" ? 0.72 : 0.92}>{children}</g>;
}

const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * Faceted mountain: a pyramid on a square base (front and right faces visible), the right face hatched for shade,
 * a snow cap on the top `snow` share of its height (bigger in winter). `cairn` adds a tiny shelter on the summit.
 */
function Peak({ x, y, r, h, snow = 0, cairn = false }: { x: number; y: number; r: number; h: number; snow?: number; cairn?: boolean }) {
  const winter = useAmbient().season === "winter";
  const A: Pt = [x, y, h];
  const Lc: Pt = [x - r, y + r, 0];
  const F: Pt = [x + r, y + r, 0];
  const R: Pt = [x + r, y - r, 0];
  const s = winter ? Math.max(snow, 0.42) : snow;
  const a = lerp(A, Lc, s);
  const b = lerp(A, F, s);
  const c = lerp(A, R, s);
  const m1 = lerp(lerp(a, b, 0.5), A, 0.4);
  const m2 = lerp(lerp(b, c, 0.5), A, 0.4);
  const [tx, ty] = proj(A);
  return (
    <g stroke={EDGE} strokeLinejoin="round">
      <polygon points={pts([Lc, F, A])} fill={FILL} />
      <polygon points={pts([F, R, A])} fill={FILL} />
      {[0.3, 0.55, 0.8].map((k) => (
        <polyline key={k} points={pts([lerp(A, lerp(F, R, k), 0.15), lerp(F, R, k)])} fill="none" strokeOpacity={0.45} />
      ))}
      {s > 0 && (
        <>
          <polygon points={pts([a, m1, b, m2, c, A])} fill={winter ? "var(--snow)" : FILL} />
          <polyline points={pts([A, b])} fill="none" />
        </>
      )}
      {cairn && <rect x={tx - 1} y={ty - 3.4} width={2} height={3.4} fill={FILL} strokeWidth="0.8" />}
    </g>
  );
}

/** Mountains drawn from the back to the front. */
function Range({ peaks }: { peaks: { x: number; y: number; r: number; h: number; snow?: number; cairn?: boolean }[] }) {
  return (
    <g>
      {[...peaks]
        .sort((p, q) => p.x + p.y - (q.x + q.y))
        .map((p, i) => (
          <Peak key={i} {...p} />
        ))}
    </g>
  );
}

/** Point on the visible (front) side of a dome hill: k = share of its height, a = angle around it. */
const hillPt = (x: number, y: number, R: number, H: number, k: number, a: number): Pt => {
  const r = R * Math.sqrt(Math.max(0, 1 - k * k));
  return [x + r * Math.cos(a), y + r * Math.sin(a), k * H];
};

/** Soft dome hill (a half spheroid): filled outline, and optional contour lines (terraces, rows of vines). */
function Hill({
  x,
  y,
  R,
  H,
  contours = [],
  dash,
  trees = 0,
}: {
  x: number;
  y: number;
  R: number;
  H: number;
  contours?: number[];
  dash?: string;
  /** Tiny trees scattered on the visible side (they make a far dome read as a wooded hill). */
  trees?: number;
}) {
  const winter = useAmbient().season === "winter";
  const rnd = seeded(`hill-${Math.round(x)}-${Math.round(y)}`);
  const dots = Array.from({ length: trees }, () => proj(hillPt(x, y, R, H, 0.15 + rnd() * 0.8, -Math.PI / 4 + 0.25 + rnd() * (Math.PI - 0.5)))).sort((p, q) => p[1] - q[1]);
  const [cx, cy] = proj([x, y, 0]);
  const rx = R * Math.SQRT2 * C;
  const ry = R * Math.SQRT1_2;
  const top = Math.sqrt(ry * ry + H * H);
  return (
    <g>
      <path d={`M${cx - rx},${cy} A${rx},${top} 0 0 1 ${cx + rx},${cy} A${rx},${ry} 0 0 1 ${cx - rx},${cy} Z`} fill={FILL} stroke="none" />
      <path d={`M${cx - rx},${cy} A${rx},${top} 0 0 1 ${cx + rx},${cy}`} fill="none" stroke={EDGE} />
      <path d={`M${cx + rx},${cy} A${rx},${ry} 0 0 1 ${cx - rx},${cy}`} fill="none" stroke={EDGE} strokeOpacity={0.4} />
      {contours.map((k) => {
        const r = Math.sqrt(1 - k * k);
        const a = rx * r;
        const b = ry * r;
        return <path key={k} d={`M${cx - a},${cy - k * H} A${a},${b} 0 0 0 ${cx + a},${cy - k * H}`} fill="none" stroke={EDGE} strokeDasharray={dash} />;
      })}
      {dots.map(([tx, ty], i) => (
        <g key={`t${i}`} stroke={EDGE}>
          <line x1={tx} y1={ty} x2={tx} y2={ty - 2.2} />
          <circle cx={tx} cy={ty - 3.6} r={1.8} fill={winter ? "var(--snow)" : FILL} />
        </g>
      ))}
    </g>
  );
}

/** Small church: nave, bell tower with a pointed spire; windows lit at night. */
function Church({ x, y, z = 0, s = 1 }: { x: number; y: number; z?: number; s?: number }) {
  const night = useAmbient().dayTime === "night";
  const [px, py] = proj([x + 1.5 * s, y + 4 * s, z + 15 * s]);
  const [sx, sy] = proj([x + 1.5 * s, y + 1.5 * s, z + 22 * s]);
  const [wx, wy] = proj([x + 7 * s, y + 6 * s, z + 3 * s]);
  return (
    <g>
      <Box x={x + 3 * s} y={y} z={z} w={9 * s} d={6 * s} h={6 * s} />
      <polygon points={pts([[x + 3 * s, y + 3 * s, z + 9 * s], [x + 12 * s, y + 3 * s, z + 9 * s], [x + 12 * s, y + 6 * s, z + 6 * s], [x + 3 * s, y + 6 * s, z + 6 * s]])} fill={FILL} stroke={EDGE} strokeLinejoin="round" />
      <Box x={x} y={y + 1 * s} z={z} w={3 * s} d={3 * s} h={15 * s} />
      <polygon points={`${px - 2.6 * s},${py} ${sx},${sy} ${px + 2.6 * s},${py}`} fill={FILL} stroke={EDGE} strokeLinejoin="round" />
      {night && <rect x={wx - 1} y={wy - 2} width={2} height={2.6} fill="var(--night-glow)" />}
    </g>
  );
}

/** Wooden lookout tower: four slanting legs with braces, a platform and a pyramid roof. */
function LookoutTower({ x, y, z, h = 22 }: { x: number; y: number; z: number; h?: number }) {
  const legs: [Pt, Pt][] = [
    [[x - 3, y - 3, z], [x - 1.6, y - 1.6, z + h]],
    [[x + 3, y - 3, z], [x + 1.6, y - 1.6, z + h]],
    [[x + 3, y + 3, z], [x + 1.6, y + 1.6, z + h]],
    [[x - 3, y + 3, z], [x - 1.6, y + 1.6, z + h]],
  ];
  const [rx, ry] = proj([x, y, z + h + 9]);
  const [ax, ay] = proj([x - 3, y + 3, z + h + 4]);
  const [bx, by] = proj([x + 3, y + 3, z + h + 4]);
  const [cx, cy] = proj([x + 3, y - 3, z + h + 4]);
  return (
    <g stroke={EDGE} fill="none" strokeLinejoin="round">
      {legs.map(([a, b], i) => (
        <polyline key={i} points={pts([a, b])} />
      ))}
      <polyline points={pts([[x - 2.6, y + 2.6, z + h * 0.35], [x + 2.6, y + 2.6, z + h * 0.65], [x + 2.6, y - 2.6, z + h * 0.35]])} />
      <Box x={x - 3} y={y - 3} z={z + h} w={6} d={6} h={4} />
      <polygon points={`${ax},${ay} ${rx},${ry} ${bx},${by}`} fill={FILL} />
      <polygon points={`${bx},${by} ${rx},${ry} ${cx},${cy}`} fill={FILL} />
    </g>
  );
}

/** Mountain lake with an island, a tiny church on it (a nod to Bled), a pier and two swans. */
function Lake({ cx, cy, rx, ry }: { cx: number; cy: number; rx: number; ry: number }) {
  const winter = useAmbient().season === "winter";
  const swan = (x: number, y: number, flip: number, k: number) => {
    const [gx, gy] = proj([x, y, 0]);
    return (
      <g key={k} stroke={EDGE} strokeLinecap="round" strokeLinejoin="round">
        <path d={`M${gx - 3 * flip},${gy - 1} q${3 * flip},2 ${6 * flip},0 l${-1.2 * flip},-1.4 z`} fill={FILL} />
        <path d={`M${gx + 2.4 * flip},${gy - 1.6} q${0.6 * flip},-3 ${-0.6 * flip},-4.4 l${1.6 * flip},0.2`} fill="none" />
      </g>
    );
  };
  return (
    <g>
      <polygon points={pts(ring(cx, cy, rx, ry, 0))} fill={FILL} stroke={EDGE} strokeLinejoin="round" />
      {!winter && (
        <>
          <polyline points={pts(ring(cx, cy, rx * 0.82, ry * 0.78, 0, Math.PI * 0.15, Math.PI * 0.85, 18))} fill="none" stroke={EDGE} strokeDasharray="2 4" />
          <polyline points={pts(ring(cx, cy, rx * 0.6, ry * 0.55, 0, Math.PI * 1.1, Math.PI * 1.6, 12))} fill="none" stroke={EDGE} strokeDasharray="2 4" />
        </>
      )}
      {/* Pier on the near shore. */}
      <polygon points={pts([[cx - rx * 0.55, cy + ry * 0.62, 0.8], [cx - rx * 0.55 + 3, cy + ry * 0.62, 0.8], [cx - rx * 0.55 + 3, cy + ry * 0.2, 0.8], [cx - rx * 0.55, cy + ry * 0.2, 0.8]])} fill={FILL} stroke={EDGE} />
      {/* Island with its church and two trees. */}
      <polygon points={pts(ring(cx + rx * 0.2, cy - ry * 0.15, 7, 5, 1.2, 0, Math.PI * 2, 20))} fill={FILL} stroke={EDGE} />
      <Pine x={cx + rx * 0.2 - 4} y={cy - ry * 0.15 - 2} z={1.2} s={0.42} />
      <Church x={cx + rx * 0.2 - 2} y={cy - ry * 0.15 - 2} z={1.2} s={0.42} />
      {!winter && [swan(cx - rx * 0.3, cy + ry * 0.25, 1, 1), swan(cx + rx * 0.55, cy + ry * 0.3, -1, 2)]}
    </g>
  );
}

/** Paraglider: a wide arched wing split into cells, lines down to the pilot sitting in the harness. */
function Paraglider({ x, y }: { x: number; y: number }) {
  const cells = [-12, -7.2, -2.4, 2.4, 7.2, 12];
  const arc = (dx: number) => y - 5 + (dx * dx) / 30;
  return (
    <g stroke={EDGE} strokeLinecap="round" strokeLinejoin="round">
      <path d={`M${x - 14},${arc(-14)} Q${x},${y - 12} ${x + 14},${arc(14)} L${x + 13},${arc(14) + 2.6} Q${x},${y - 8.6} ${x - 13},${arc(-14) + 2.6} Z`} fill={FILL} />
      {cells.slice(1, -1).map((d) => (
        <line key={d} x1={x + d} y1={arc(d) - 3.2 + Math.abs(d) * 0.05} x2={x + d * 0.94} y2={arc(d) - 0.6 + Math.abs(d) * 0.05} />
      ))}
      <path d={`M${x - 13},${arc(-14) + 2.6} L${x - 1},${y + 9} M${x - 4.8},${y - 6.4} L${x - 0.6},${y + 9} M${x + 4.8},${y - 6.4} L${x + 0.6},${y + 9} M${x + 13},${arc(14) + 2.6} L${x + 1},${y + 9}`} fill="none" strokeOpacity={0.6} />
      <circle cx={x} cy={y + 10.4} r={1.3} fill={FILL} />
      <path d={`M${x - 1},${y + 12} l0.6,2.6 l2.4,0`} fill="none" />
    </g>
  );
}

/** A small flock of birds (a few "v" strokes) that flap their wings. */
function Birds({ x, y, n = 5 }: { x: number; y: number; n?: number }) {
  return (
    <g stroke={EDGE} fill="none" strokeLinecap="round" strokeLinejoin="round">
      {Array.from({ length: n }, (_, i) => {
        const bx = x + (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 6;
        const by = y + Math.ceil(i / 2) * 4;
        return (
          <g key={i} className="kv-flap" style={{ animationDuration: `${0.5 + (i % 3) * 0.08}s` }}>
            <path d={`M${bx - 3},${by - 1.2} Q${bx - 1.5},${by - 2} ${bx},${by} Q${bx + 1.5},${by - 2} ${bx + 3},${by - 1.2}`} />
          </g>
        );
      })}
    </g>
  );
}

/** Castle on its hill: walls, a tall tower with a flag, a funicular with a cabin going up and down. */
function Castle({ x, y, z }: { x: number; y: number; z: number }) {
  const night = useAmbient().dayTime === "night";
  const [fx, fy] = proj([x + 25.5, y + 3.5, z + 22]);
  const crenels = Array.from({ length: 7 }, (_, i) => x + 1 + i * 3.4);
  return (
    <g>
      <Box x={x} y={y} z={z} w={24} d={12} h={8} />
      {crenels.map((cx, i) => (
        <Box key={i} x={cx} y={y + 11} z={z + 8} w={1.6} d={1} h={1.6} />
      ))}
      <Box x={x + 23} y={y + 1} z={z} w={6} d={6} h={18} />
      <Box x={x + 22.5} y={y + 0.5} z={z + 18} w={7} d={7} h={2} />
      <line x1={fx} y1={fy} x2={fx} y2={fy - 9} stroke={EDGE} />
      <path d={`M${fx},${fy - 9} l6,1.5 l-6,1.5 z`} fill={FILL} stroke={EDGE} strokeLinejoin="round" />
      {night &&
        [4, 9, 14, 19].map((wx) => {
          const [a, b] = proj([x + wx, y + 12, z + 4]);
          return <rect key={wx} x={a - 0.8} y={b - 1.6} width={1.6} height={2.2} fill="var(--night-glow)" />;
        })}
    </g>
  );
}

/** Ferris wheel facing the viewer: two legs, a slowly turning wheel with cabins (lit at night). */
function FerrisWheel({ x, y, r = 16 }: { x: number; y: number; r?: number }) {
  const night = useAmbient().dayTime === "night";
  const [hx, hy] = proj([x, y, r + 4]);
  const [lx, ly] = proj([x - 7, y + 3, 0]);
  const [qx, qy] = proj([x + 7, y - 3, 0]);
  const cabins = Array.from({ length: 10 }, (_, i) => (i * Math.PI * 2) / 10);
  return (
    <g strokeLinejoin="round">
      <polyline points={`${lx},${ly} ${hx},${hy} ${qx},${qy}`} fill="none" stroke={EDGE} />
      <Spin seconds={60}>
        <circle cx={hx} cy={hy} r={r} fill="none" stroke={EDGE} />
        <circle cx={hx} cy={hy} r={r * 0.82} fill="none" stroke={EDGE} strokeDasharray="1 2.5" />
        {cabins.map((a, i) => (
          <line key={`s${i}`} x1={hx} y1={hy} x2={hx + Math.cos(a) * r} y2={hy + Math.sin(a) * r} stroke={EDGE} />
        ))}
        {cabins.map((a, i) => (
          <circle key={`c${i}`} cx={hx + Math.cos(a) * r} cy={hy + Math.sin(a) * r} r={1.9} fill={night ? "var(--night-glow)" : FILL} stroke={EDGE} />
        ))}
      </Spin>
      <circle cx={hx} cy={hy} r={1.6} fill={FILL} stroke={EDGE} />
    </g>
  );
}

/** Hot-air balloon: envelope with gores, ropes and a basket; the burner glows at night. */
function Balloon({ x, y }: { x: number; y: number }) {
  const night = useAmbient().dayTime === "night";
  return (
    <g stroke={EDGE} strokeLinejoin="round" strokeLinecap="round">
      {night && <circle cx={x} cy={y + 9} r={3.5} fill="var(--night-glow)" stroke="none" opacity={0.9} />}
      <path d={`M${x - 3},${y + 8} C${x - 12},${y + 1} ${x - 10},${y - 13} ${x},${y - 13} C${x + 10},${y - 13} ${x + 12},${y + 1} ${x + 3},${y + 8} Z`} fill={FILL} />
      <path d={`M${x},${y - 13} C${x - 4},${y - 8} ${x - 3},${y + 3} ${x - 1},${y + 8} M${x},${y - 13} C${x + 4},${y - 8} ${x + 3},${y + 3} ${x + 1},${y + 8}`} fill="none" stroke={EDGE} />
      <path d={`M${x - 9.6},${y - 4} Q${x},${y - 1.5} ${x + 9.6},${y - 4}`} fill="none" stroke={EDGE} />
      <line x1={x - 3} y1={y + 8} x2={x - 2} y2={y + 12} />
      <line x1={x + 3} y1={y + 8} x2={x + 2} y2={y + 12} />
      <rect x={x - 2.4} y={y + 12} width={4.8} height={3} fill={FILL} />
    </g>
  );
}

/** Small airliner crossing the sky; a light blinks at night. */
function Plane({ x, y }: { x: number; y: number }) {
  const night = useAmbient().dayTime === "night";
  return (
    <g stroke={EDGE} strokeLinecap="round" strokeLinejoin="round">
      <path d={`M${x - 9},${y} L${x + 8},${y} Q${x + 10.5},${y} ${x + 9},${y + 1.4} L${x - 8},${y + 1.4} Z`} fill={FILL} stroke={EDGE} />
      <path d={`M${x + 1},${y + 0.8} L${x - 4},${y + 5} L${x - 1.8},${y + 5} L${x + 4},${y + 0.8}`} fill={FILL} stroke={EDGE} />
      <path d={`M${x - 7},${y} L${x - 9},${y - 4} L${x - 7.6},${y - 4} L${x - 4.6},${y}`} fill={FILL} stroke={EDGE} />
      <line x1={x - 12} y1={y + 0.7} x2={x - 30} y2={y + 0.7} strokeDasharray="3 3" />
      {night && <circle className="kv-blink" cx={x - 8.6} cy={y - 4.2} r={1.6} fill="var(--night-glow)" stroke="none" />}
    </g>
  );
}

/** Kozolec "toplar": two hay racks under one gabled roof, slats on both racks. */
function Kozolec({ x, y, L = 30, d = 9 }: { x: number; y: number; L?: number; d?: number }) {
  const h = 13;
  const posts = [0, L / 3, (2 * L) / 3, L];
  const slats = [2.5, 5, 7.5, 10];
  return (
    <g stroke={EDGE} fill="none" strokeLinejoin="round">
      {slats.map((z) => (
        <polyline key={`b${z}`} points={lineX(x, x + L, y, z)} />
      ))}
      {posts.map((px) => (
        <polyline key={`pb${px}`} points={pts([[x + px, y, 0], [x + px, y, h]])} />
      ))}
      <polyline points={pts([[x + L, y, 0], [x + L, y + d, 0]])} />
      {posts.map((px) => (
        <polyline key={`pf${px}`} points={pts([[x + px, y + d, 0], [x + px, y + d, h]])} />
      ))}
      {slats.map((z) => (
        <polyline key={`f${z}`} points={lineX(x, x + L, y + d, z)} />
      ))}
      <polygon points={pts([[x - 2, y + d / 2, h + 6], [x + L + 2, y + d / 2, h + 6], [x + L + 2, y + d + 2, h], [x - 2, y + d + 2, h]])} fill={FILL} />
      <polygon points={pts([[x + L + 2, y - 2, h], [x + L + 2, y + d / 2, h + 6], [x + L + 2, y + d + 2, h]])} fill={FILL} />
    </g>
  );
}

/** Stork on its nest on a pole (spring and summer); in autumn and winter the nest waits empty. */
function StorkNest({ x, y }: { x: number; y: number }) {
  const { season } = useAmbient();
  const home = season === "spring" || season === "summer";
  const [gx, gy] = proj([x, y, 0]);
  const [nx, ny] = proj([x, y, 24]);
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <line x1={gx} y1={gy} x2={nx} y2={ny} stroke={EDGE} />
      <line x1={nx - 4} y1={ny} x2={nx + 4} y2={ny} stroke={EDGE} />
      {home && (
        <g stroke={EDGE}>
          <path d={`M${nx + 2.6},${ny - 2.4} l0.4,-6`} fill="none" />
          <circle cx={nx + 3.1} cy={ny - 9} r={1.3} fill={FILL} />
          <line x1={nx + 4.3} y1={ny - 9} x2={nx + 7.6} y2={ny - 8} />
          <ellipse cx={nx} cy={ny - 2.6} rx={3.6} ry={1.8} fill={FILL} />
          <path d={`M${nx - 3.4},${ny - 2.4} l-2.4,1`} fill="none" />
        </g>
      )}
      <ellipse cx={nx} cy={ny - 0.6} rx={5.4} ry={2} fill={season === "winter" ? "var(--snow)" : FILL} stroke={EDGE} />
      <path d={`M${nx - 5},${ny - 0.4} l1.5,-1 l1.5,1 l1.5,-1 l1.5,1 l1.5,-1 l1.5,1`} fill="none" stroke={EDGE} />
    </g>
  );
}

/** Sunflower field by season: sprouts in spring, flowers turned to the sun in summer, bowed heads in autumn, snow in winter. */
function Sunflowers({ x0, x1, y0, y1 }: { x0: number; x1: number; y0: number; y1: number }) {
  const { season } = useAmbient();
  const items: ReactNode[] = [];
  if (season !== "winter") {
    for (let y = y0 + 3, j = 0; y < y1 - 1; y += 4, j++) {
      for (let x = x0 + 3 + (j % 2) * 2; x < x1 - 2; x += 4.5) {
        const [gx, gy] = proj([x, y, 0]);
        const k = `${x}-${y}`;
        if (season === "spring") items.push(<line key={k} x1={gx} y1={gy} x2={gx} y2={gy - 2.4} stroke={EDGE} />);
        else
          items.push(
            <g key={k}>
              <line x1={gx} y1={gy} x2={gx} y2={gy - 5} stroke={EDGE} />
              {season === "summer" ? (
                <circle cx={gx} cy={gy - 6.2} r={1.5} fill={FILL} stroke={EDGE} strokeDasharray="1 0.6" />
              ) : (
                <circle cx={gx + 1.2} cy={gy - 4.4} r={1.2} fill={FILL} stroke={EDGE} />
              )}
            </g>,
          );
      }
    }
  }
  return (
    <g>
      <polygon points={pts([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]])} fill="none" stroke={EDGE} />
      {items}
    </g>
  );
}

/** A river along x (gently wavy banks, a few ripples); frozen white in winter. */
function River({ x0, x1, y, w = 9 }: { x0: number; x1: number; y: number; w?: number }) {
  const winter = useAmbient().season === "winter";
  const n = 40;
  const bank = (off: number, ph: number): Pt[] =>
    Array.from({ length: n + 1 }, (_, i) => {
      const x = x0 + ((x1 - x0) * i) / n;
      return [x, y + off + Math.sin(i * 0.7 + ph) * 0.9, 0];
    });
  const near = bank(w, 0);
  const far = bank(0, 1.7);
  return (
    <g>
      <polygon points={pts([...far, ...near.slice().reverse()])} fill={FILL} stroke="none" />
      <polyline points={pts(far)} fill="none" stroke={EDGE} />
      <polyline points={pts(near)} fill="none" stroke={EDGE} />
      {!winter &&
        Array.from({ length: Math.floor((x1 - x0) / 22) }, (_, i) => {
          const [rx, ry] = proj([x0 + 10 + i * 22, y + (i % 2 ? w * 0.35 : w * 0.65), 0]);
          return <path key={i} d={`M${rx - 3},${ry} q1.5,-1.4 3,0 t3,0`} fill="none" stroke={EDGE} strokeOpacity={0.7} />;
        })}
    </g>
  );
}

/** Floating mill on the river (like the one on the Mura): a house on two pontoons, the wheel turning in between. */
function FloatingMill({ x, y }: { x: number; y: number }) {
  const [wx, wy] = proj([x + 15, y + 4, 3]);
  return (
    <g strokeLinejoin="round">
      <Box x={x} y={y} z={0} w={13} d={9} h={1.5} />
      <Box x={x + 1} y={y + 1} z={1.5} w={10} d={7} h={7} />
      <polygon points={pts([[x + 0.5, y + 4.5, 12.5], [x + 11.5, y + 4.5, 12.5], [x + 11.5, y + 8.6, 8.5], [x + 0.5, y + 8.6, 8.5]])} fill={FILL} stroke={EDGE} />
      <polygon points={pts([[x + 11.5, y + 0.4, 8.5], [x + 11.5, y + 4.5, 12.5], [x + 11.5, y + 8.6, 8.5]])} fill={FILL} stroke={EDGE} />
      <Spin seconds={14}>
        <circle cx={wx} cy={wy} r={5.5} fill={FILL} stroke={EDGE} />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return <line key={i} x1={wx} y1={wy} x2={wx + Math.cos(a) * 5.5} y2={wy + Math.sin(a) * 5.5} stroke={EDGE} />;
        })}
      </Spin>
      <Box x={x + 18} y={y} z={0} w={4} d={9} h={1.5} />
    </g>
  );
}

/** Klopotec: the Styrian wind rattle in the vineyard – a pole, four turning blades and a brush tail. */
function Klopotec({ x, y, z }: { x: number; y: number; z: number }) {
  const [gx, gy] = proj([x, y, z]);
  const [tx, ty] = proj([x, y, z + 12]);
  return (
    <g stroke={EDGE} strokeLinecap="round">
      <line x1={gx} y1={gy} x2={tx} y2={ty} />
      <path d={`M${tx},${ty} l-7,1.5 M${tx - 7},${ty + 1.5} l-2,-2.5 M${tx - 7},${ty + 1.5} l-2.5,0 M${tx - 7},${ty + 1.5} l-2,2.5`} fill="none" />
      <Spin seconds={3}>
        {[0, 1, 2, 3].map((i) => {
          const a = (i * Math.PI) / 2;
          const c = Math.cos(a);
          const s = Math.sin(a);
          return (
            <g key={i}>
              <line x1={tx} y1={ty} x2={tx + c * 6} y2={ty + s * 6} />
              <line x1={tx + c * 3.5 - s * 1.4} y1={ty + s * 3.5 + c * 1.4} x2={tx + c * 6 - s * 1.4} y2={ty + s * 6 + c * 1.4} />
            </g>
          );
        })}
      </Spin>
      <circle cx={tx} cy={ty} r={1} fill={FILL} />
    </g>
  );
}

/** Small vineyard cottage (zidanica): a white box with a gabled roof. */
function Zidanica({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <g strokeLinejoin="round">
      <Box x={x} y={y} z={z} w={8} d={6} h={5} />
      <polygon points={pts([[x - 0.6, y + 3, z + 8.5], [x + 8.6, y + 3, z + 8.5], [x + 8.6, y + 6.6, z + 5], [x - 0.6, y + 6.6, z + 5]])} fill={FILL} stroke={EDGE} />
      <polygon points={pts([[x + 8.6, y - 0.6, z + 5], [x + 8.6, y + 3, z + 8.5], [x + 8.6, y + 6.6, z + 5]])} fill={FILL} stroke={EDGE} />
    </g>
  );
}


// ---------- Backdrops per scene ----------

type PeakSpec = [f: number, D: number, r: number, h: number, snow?: number];

/** Park: a lake with an island just behind, forested hills with a lookout tower, the Julian Alps far away. */
function parkBackdrop(rows: TownRow[], L: SceneLayers) {
  const B = backdrop(rows);
  // Far: the Alps, the three-headed main peak with a tiny shelter on the summit.
  const alps: PeakSpec[] = [
    [0.5, 140, 20, 36, 0.3],
    [0.6, 150, 24, 50, 0.32],
    [0.7, 146, 12, 56, 0.34],
    [0.76, 152, 30, 70, 0.38],
    [0.83, 146, 12, 58, 0.34],
    [0.94, 150, 24, 46, 0.3],
    [1.05, 140, 20, 34, 0.25],
    [1.14, 132, 16, 24],
  ];
  const peaks = alps.map(([f, D, r, h, snow]) => {
    const [x, y] = B.at(f, D);
    return { x, y, r, h, snow, cairn: h === 70 };
  });
  // Mid: forested hills, pines on their slopes, a lookout tower on the right one.
  const hills = [
    { f: 0.42, D: 96, R: 26, H: 22 },
    { f: 0.98, D: 92, R: 24, H: 20 },
  ].map((h) => ({ ...h, at: B.at(h.f, h.D) }));
  const pines = hills.flatMap(({ at: [x, y], R, H }, j) =>
    [0.25, 0.55, 0.8].flatMap((k, i) =>
      Array.from({ length: 4 - i }, (_, n) => {
        const a = -Math.PI / 4 + 0.35 + ((Math.PI - 0.7) * (n + (i % 2) * 0.5)) / (4 - i);
        return hillPt(x, y, R, H, k, a);
      }).filter(() => j === 0 || k < 0.8),
    ),
  );
  pines.sort((p, q) => proj(p)[1] - proj(q)[1]);
  const [tx, ty] = hills[1]!.at;
  // Near: the lake just behind the row.
  const [lx, ly] = B.at(1.1, 34);
  L.far.push(
    <Layer key="far" depth="far">
      <Range peaks={peaks} />
    </Layer>,
    <Layer key="mid" depth="mid">
      {hills.map(({ at: [x, y], R, H }, i) => (
        <Hill key={i} x={x} y={y} R={R} H={H} />
      ))}
      {pines.map(([x, y, z], i) => (
        <Pine key={i} x={x} y={y} z={z} s={0.42 + (i % 3) * 0.06} />
      ))}
      <LookoutTower x={tx} y={ty} z={hills[1]!.H} h={20} />
    </Layer>,
    <Layer key="near" depth="near">
      <Lake cx={lx} cy={ly} rx={30} ry={16} />
    </Layer>,
  );
  L.extent.push(...peaks.map((p) => [p.x, p.y, p.h + 4] as Pt), B.at(1.14, 132, 0), [tx, ty, hills[1]!.H + 32], [lx - 32, ly - 18, 0]);

  // Sky: a paraglider drifting over the right half, a flock of birds the other way.
  const sky = skyLane(B, L, 70);
  const x0 = B.sx(0.35);
  const x1 = B.sx(1.15);
  L.moving.push(
    <Drift key="pg" sx={x1 - x0} sy={10} seconds={60} phase={0.35}>
      <g className="kv-bob" style={{ animationDuration: "2.4s" }}>
        <Paraglider x={x0} y={sky - 12} />
      </g>
    </Drift>,
    <Drift key="birds" sx={-(B.sx(1.1) - B.sx(0.1))} sy={0} seconds={40} phase={0.7}>
      <Birds x={B.sx(1.1)} y={sky - 6} />
    </Drift>,
  );
}

/** City: a castle on its hill with a funicular, a ferris wheel, soft hills far away, a balloon and a plane. */
function cityBackdrop(rows: TownRow[], L: SceneLayers) {
  const B = backdrop(rows);
  // Far: soft hills around the city.
  const hills = [
    { f: 0.6, D: 158, R: 26, H: 18 },
    { f: 0.74, D: 150, R: 24, H: 16 },
    { f: 0.88, D: 162, R: 30, H: 24 },
    { f: 1.02, D: 150, R: 24, H: 17 },
    { f: 1.14, D: 142, R: 20, H: 13 },
  ]
    .map((h) => ({ ...h, at: B.at(h.f, h.D) }))
    .sort((p, q) => p.at[0] + p.at[1] - (q.at[0] + q.at[1]));
  // Mid: the castle hill with the castle on top and the funicular going up its side.
  const C0 = { R: 30, H: 24, at: B.at(0.32, 104) };
  const [hx, hy] = C0.at;
  const base = hillPt(hx, hy, C0.R, C0.H, 0, Math.PI * 0.55);
  const station = hillPt(hx, hy, C0.R, C0.H, 0.92, Math.PI * 0.4);
  const [bx, by] = proj(base);
  const [sx, sy] = proj(station);
  // Near: the ferris wheel at the far right end.
  const [wx, wy] = B.at(1.12, 62);
  L.far.push(
    <Layer key="far" depth="far">
      {hills.map(({ at: [x, y], R, H }, i) => (
        <Hill key={i} x={x} y={y} R={R} H={H} trees={Math.round(R / 3)} />
      ))}
    </Layer>,
    <Layer key="mid" depth="mid">
      <Hill x={hx} y={hy} R={C0.R} H={C0.H} contours={[0.45]} dash="2 3" />
      <line x1={bx} y1={by} x2={sx} y2={sy} stroke={EDGE} />
      <Castle x={hx - 14} y={hy - 6} z={C0.H - 1} />
      <Drift sx={sx - bx} sy={sy - by} seconds={16} phase={0.2} mode="shuttle">
        <rect x={bx - 2.4} y={by - 4.2} width={4.8} height={3.6} rx={0.6} fill={FILL} stroke={EDGE} />
      </Drift>
    </Layer>,
    <Layer key="near" depth="near">
      <FerrisWheel x={wx} y={wy} r={17} />
    </Layer>,
  );
  L.extent.push(...hills.map(({ at: [x, y], R, H }) => [x, y - R, H] as Pt), [hx, hy, C0.H + 32], [wx, wy, 40], [wx + 10, wy, 0]);

  // Sky: a hot-air balloon floating, a plane crossing high above.
  const sky = skyLane(B, L, 70, 22);
  const x0 = B.sx(0.05);
  const x1 = B.sx(1.15);
  L.moving.push(
    <Drift key="balloon" sx={10} sy={-6} seconds={11} phase={0.4} mode="shuttle">
      <Balloon x={B.sx(0.6)} y={sky - 6} />
    </Drift>,
    <Drift key="plane" sx={x1 - x0} sy={-8} seconds={46} phase={0.3}>
      <Plane x={x0} y={sky - 14} />
    </Drift>,
  );
}

/** Countryside (Prekmurje and Styria): kozolec, stork, sunflowers, the Mura with a floating mill, vineyard hills, Goričko far away. */
function countryBackdrop(rows: TownRow[], L: SceneLayers) {
  const B = backdrop(rows);
  // Far: the soft hills of Goričko.
  const far = [
    { f: 0.42, D: 150, R: 26, H: 15 },
    { f: 0.56, D: 160, R: 30, H: 20 },
    { f: 0.7, D: 148, R: 26, H: 16 },
    { f: 0.84, D: 158, R: 32, H: 22 },
    { f: 0.98, D: 146, R: 26, H: 16 },
    { f: 1.12, D: 138, R: 22, H: 12 },
  ]
    .map((h) => ({ ...h, at: B.at(h.f, h.D) }))
    .sort((p, q) => p.at[0] + p.at[1] - (q.at[0] + q.at[1]));
  // Mid: vineyard hills with rows of vines, a church on the left top, a zidanica and a klopotec on the right one.
  const v1 = { R: 28, H: 26, at: B.at(0.3, 100) };
  const v2 = { R: 31, H: 30, at: B.at(0.74, 104) };
  const zid = hillPt(v2.at[0], v2.at[1], v2.R, v2.H, 0.55, Math.PI * 0.35);
  // The Mura with a floating mill, then (just behind the row) kozolec, sunflowers and a stork's nest.
  const [r0] = B.at(0.02, 72);
  const [r1, ry] = B.at(1.14, 72);
  const [mx, my] = B.at(0.82, 73);
  const [kx, ky] = B.at(0.12, 44);
  const [s0, sy0] = B.at(0.4, 52);
  const [s1] = B.at(0.66, 52);
  const [nx, ny] = B.at(0.9, 40);
  L.far.push(
    <Layer key="far" depth="far">
      {far.map(({ at: [x, y], R, H }, i) => (
        <Hill key={i} x={x} y={y} R={R} H={H} trees={Math.round(R / 4)} />
      ))}
    </Layer>,
    <Layer key="mid" depth="mid">
      {[v1, v2].map(({ at: [x, y], R, H }, i) => (
        <Hill key={i} x={x} y={y} R={R} H={H} contours={[0.2, 0.38, 0.56, 0.74]} dash="1.5 2.5" />
      ))}
      <Church x={v1.at[0] - 6} y={v1.at[1] - 3} z={v1.H - 1} s={0.9} />
      <Zidanica x={zid[0] - 4} y={zid[1] - 3} z={zid[2]} />
      <Klopotec x={v2.at[0] + 4} y={v2.at[1]} z={v2.H} />
    </Layer>,
    <Layer key="near" depth="near">
      <River x0={r0} x1={r1} y={ry} w={10} />
      <FloatingMill x={mx} y={my} />
      <Kozolec x={kx} y={ky} />
      <Sunflowers x0={s0} x1={s1} y0={sy0} y1={sy0 + 14} />
      <StorkNest x={nx} y={ny} />
    </Layer>,
  );
  L.extent.push(...far.map(({ at: [x, y], R, H }) => [x, y - R, H] as Pt), [v1.at[0], v1.at[1], v1.H + 26], [v2.at[0], v2.at[1], v2.H + 16], [r1, ry, 0]);

  // Sky: a flock of birds crossing.
  const sky = skyLane(B, L, 60);
  const x0 = B.sx(0.05);
  const x1 = B.sx(1.15);
  L.moving.push(
    <Drift key="birds" sx={x1 - x0} sy={-6} seconds={34} phase={0.15}>
      <Birds x={x0} y={sky - 10} n={7} />
    </Drift>,
  );
}
