import { ArrowRight, CircleCheck, Clock, Square, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Eyebrow } from "@/components/brand";
import { usePropertyTown, type TownBuilding, type UnitState } from "@/hooks/usePropertyTown";
import { useTownScene } from "@/hooks/useTownScene";
import { cn } from "@/lib/utils";
import type { Property } from "@/types/domain";
import { proj, seeded, type Pt, type TownRow } from "./townGeometry";
import { sceneLayers, TOWN_SCENES } from "./townScenes";

/**
 * The landlord's properties as a small isometric town on the panel (CGP line art, follows the theme):
 * one building per property, one window per unit, lit by the unit's state.
 * The building follows the property type: a small gabled house, a larger gabled multi-unit house with a front
 * entrance, an apartment block (in both of those only the landlord's flats light up among the neighbours')
 * or a low commercial building with ribbon windows and a shutter door.
 */

const EDGE = "var(--panel-edge)";
const GRID = "var(--panel-scene-grid)";
const PER_ROW = 5;
const GAP = 26;
const MIN_W = 440;
const MIN_H = 170;


interface Win {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Index into the property's units, or null for a neighbour's flat (stays dark). */
  unit: number | null;
}
interface Shape {
  w: number;
  d: number;
  /** Wall height (eaves for a house). */
  h: number;
  /** Gable roof height above the walls (house only; 0 = flat roof with parapet). */
  roof: number;
  door: [number, number, number] | null; // on the right face: y0, y1, z1
  /** Main entrance on the front face (multi-unit house): x0, x1, z1. */
  frontDoor: [number, number, number] | null;
  /** Roller shutter (commercial): horizontal slats on the door. */
  shutter: boolean;
  windows: Win[]; // front-left face, one per unit
  side: Omit<Win, "unit">[]; // right face, decorative
}

/** Highest point of the shape (walls + roof). */
const topOf = (s: Shape) => s.h + s.roof;

function shapeFor(b: TownBuilding): Shape {
  if (b.type === "HOUSE") return houseShape(b);
  if (b.type === "MULTI_UNIT_HOUSE") return multiUnitHouseShape(b);
  if (b.type === "COMMERCIAL") return commercialShape(b);
  return blockShape(b);
}

/**
 * Apartment block: the landlord usually owns only some flats in it.
 * The block has more flats than the landlord's units; only theirs light up (one window per unit),
 * spread over the facade, the rest stay dark.
 */
function blockShape(b: TownBuilding): Shape {
  const n = b.units.length;
  const rnd = seeded(b.id);
  const cols = n <= 12 ? 3 : 4;
  const floors = Math.max(3 + Math.floor(rnd() * 3), Math.ceil(n / cols)); // 3–5 floors, more if needed
  const cell = 16;
  const floorH = 18;
  const slots = Array.from({ length: cols * floors }, (_, i) => i);
  // Shuffle the slots and give the first n to the landlord's units.
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [slots[i], slots[j]] = [slots[j]!, slots[i]!];
  }
  const owner = new Map(slots.slice(0, n).map((slot, u) => [slot, u]));
  const windows: Win[] = Array.from({ length: cols * floors }, (_, i) => {
    const col = i % cols;
    const floor = Math.floor(i / cols);
    const x0 = 6 + col * cell + 3;
    const z0 = floor * floorH + 5;
    return { x0, x1: x0 + 10, z0, z1: z0 + 10, unit: owner.get(i) ?? null };
  });
  const d = 28;
  const side = Array.from({ length: floors - 1 }, (_, f) => {
    const z0 = (f + 1) * floorH + 5;
    return [
      { x0: 4, x1: 11, z0, z1: z0 + 10 },
      { x0: 17, x1: 24, z0, z1: z0 + 10 },
    ];
  }).flat();
  return { w: cols * cell + 12, d, h: floors * floorH + 6, roof: 0, door: [10, 18, 13], frontDoor: null, shutter: false, windows, side };
}

/**
 * House: two floors (more only if needed) under a gable roof. The landlord owns the whole house,
 * so windows light up in order from the ground floor; spare windows stay dark.
 */
function houseShape(b: TownBuilding): Shape {
  const n = b.units.length;
  const cols = n <= 2 ? 2 : 3;
  const floors = Math.max(2, Math.ceil(n / cols));
  const cell = 18;
  const floorH = 18;
  const windows: Win[] = Array.from({ length: cols * floors }, (_, i) => {
    const col = i % cols;
    const floor = Math.floor(i / cols);
    const x0 = 6 + col * cell + 4;
    const z0 = floor * floorH + 5;
    return { x0, x1: x0 + 10, z0, z1: z0 + 10, unit: i < n ? i : null };
  });
  const d = 30;
  // Gable side: windows on the upper floors only (the door is on the ground floor).
  const side = Array.from({ length: floors - 1 }, (_, f) => {
    const z0 = (f + 1) * floorH + 5;
    return [
      { x0: 5, x1: 12, z0, z1: z0 + 10 },
      { x0: 18, x1: 25, z0, z1: z0 + 10 },
    ];
  }).flat();
  // Roof taller than half the depth, so the front slope hides the back of the roof.
  return { w: cols * cell + 12, d, h: floors * floorH + 2, roof: d / 2 + 5, door: [11, 19, 13], frontDoor: null, shutter: false, windows, side };
}

/**
 * Multi-unit house (dvo-/tristanovanjska hiša): three floors under a gable roof, a front entrance in the middle
 * of the ground floor. Like a block, the landlord may own only some flats: theirs light up, the rest stay dark.
 */
function multiUnitHouseShape(b: TownBuilding): Shape {
  const n = b.units.length;
  const rnd = seeded(b.id);
  const cols = 3;
  const cell = 17;
  const floorH = 18;
  const doorCol = 1;
  // Ground-floor middle is the entrance, so it has no window.
  const free = (floors: number) => cols * floors - 1;
  let floors = 3;
  while (free(floors) < n) floors += 1;
  const slots: { col: number; floor: number }[] = [];
  for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) if (!(f === 0 && c === doorCol)) slots.push({ col: c, floor: f });
  const order = slots.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const owner = new Map(order.slice(0, n).map((slot, u) => [slot, u]));
  const windows: Win[] = slots.map(({ col, floor }, i) => {
    const x0 = 6 + col * cell + 3;
    const z0 = floor * floorH + 5;
    return { x0, x1: x0 + 10, z0, z1: z0 + 10, unit: owner.get(i) ?? null };
  });
  const d = 32;
  const side = Array.from({ length: floors }, (_, f) => {
    const z0 = f * floorH + 5;
    return [
      { x0: 5, x1: 12, z0, z1: z0 + 10 },
      { x0: 20, x1: 27, z0, z1: z0 + 10 },
    ];
  }).flat();
  const dx = 6 + doorCol * cell + 3;
  return { w: cols * cell + 12, d, h: floors * floorH + 2, roof: d / 2 + 5, door: null, frontDoor: [dx, dx + 11, 14], shutter: false, windows, side };
}

/**
 * Commercial building (office, warehouse, shop): wide and low, ribbon windows (one per unit, in order),
 * a flat roof with parapet and a large roller-shutter door on the side.
 */
function commercialShape(b: TownBuilding): Shape {
  const n = b.units.length;
  const cols = Math.min(4, Math.max(2, n));
  const floors = Math.max(2, Math.ceil(n / cols));
  const cell = 22;
  const floorH = 16;
  const windows: Win[] = Array.from({ length: cols * floors }, (_, i) => {
    const col = i % cols;
    const floor = Math.floor(i / cols);
    const x0 = 6 + col * cell + 2;
    const z0 = floor * floorH + 6;
    return { x0, x1: x0 + 18, z0, z1: z0 + 7, unit: i < n ? i : null };
  });
  const d = 34;
  const side = Array.from({ length: floors - 1 }, (_, f) => {
    const z0 = (f + 1) * floorH + 6;
    return [{ x0: 4, x1: 30, z0, z1: z0 + 7 }];
  }).flat();
  return { w: cols * cell + 12, d, h: floors * floorH + 6, roof: 0, door: [7, 27, 13], frontDoor: null, shutter: true, windows, side };
}

interface Placed {
  b: TownBuilding;
  s: Shape;
  bx: number;
  by: number;
  index: number;
}

function layout(buildings: TownBuilding[]): { placed: (Placed & { row: number })[]; rows: TownRow[] } {
  const placed: (Placed & { row: number })[] = [];
  const rows: TownRow[] = [];
  let by = 0;
  for (let r = 0; r * PER_ROW < buildings.length; r++) {
    const row = buildings.slice(r * PER_ROW, r * PER_ROW + PER_ROW);
    const shapes = row.map(shapeFor);
    const depth = Math.max(...shapes.map((s) => s.d));
    let bx = 0;
    row.forEach((b, i) => {
      const s = shapes[i]!;
      placed.push({ b, s, bx, by: by + (depth - s.d), index: r * PER_ROW + i, row: r });
      // The next building's front-left face reaches back by its depth; keep that clear of this one's side (door).
      const next = shapes[i + 1];
      bx += s.w + Math.max(GAP, (next?.d ?? 0) + 8);
    });
    const inRow = placed.slice(r * PER_ROW);
    rows.push({
      index: r,
      x0: 0,
      x1: Math.max(...inRow.map((q) => q.bx + q.s.w)),
      y0: by,
      y1: by + depth,
      gaps: inRow.slice(0, -1).map((q, i) => ({ after: q.index, x0: q.bx + q.s.w + 6, x1: inRow[i + 1]!.bx - 6 })),
    });
    // The next row stands in front: move it forward far enough that its roofs stay below this row's plots.
    const next = buildings.slice((r + 1) * PER_ROW, (r + 2) * PER_ROW).map(shapeFor);
    const tallest = next.length ? Math.max(...next.map(topOf)) : 0;
    by += depth + GAP + 2 * tallest;
  }
  return { placed, rows };
}

const poly = (pts: Pt[], bx: number, by: number) =>
  pts
    .map(([x, y, z]) => proj([bx + x, by + y, z]))
    .map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`)
    .join(" ");

const WINDOW_CLASS: Record<UnitState, string> = {
  settled: "fill-signal stroke-signal",
  open: "fill-ink-on-panel/25 stroke-ink-on-panel-muted",
  attention: "fill-[var(--warn-on-panel)] stroke-[var(--warn-on-panel)]",
  vacant: "fill-[var(--panel)] stroke-ink-on-panel-muted",
};

function Building({ p, label, windowTitle }: { p: Placed; label: string; windowTitle: (name: string, state: UnitState) => string }) {
  const { s, bx, by, b } = p;
  const { w, d, h } = s;
  const P = (pts: Pt[]) => poly(pts, bx, by);
  const winPts = (win: Win) => P([[win.x0, d, win.z0], [win.x1, d, win.z0], [win.x1, d, win.z1], [win.x0, d, win.z1]]);
  const empty = b.units.length === 0;
  const face = cn("fill-[var(--panel)] transition-colors duration-200 stroke-[var(--panel-edge)] group-hover:stroke-ink-on-panel-muted group-focus-visible:stroke-signal");
  const dash = empty ? "3 3" : undefined;
  const door = s.door ?? [0, 0, 0];

  return (
    <g className="group">
    <Link to={b.to} aria-label={label} className="outline-none">
      <title>{label}</title>
      {/* Plot. */}
      <polygon points={P([[-6, -6, 0], [w + 6, -6, 0], [w + 6, d + 6, 0], [-6, d + 6, 0]])} fill="none" stroke={EDGE} strokeOpacity="0.45" strokeDasharray="2 3" />
      <g strokeWidth="1" strokeLinejoin="round" strokeDasharray={dash}>
        <polygon className={face} points={P([[0, d, 0], [w, d, 0], [w, d, h], [0, d, h]])} />
        <polygon className={face} points={P([[w, 0, 0], [w, d, 0], [w, d, h], [w, 0, h]])} />
        {s.door && <polygon className={face} points={P([[w, s.door[0], 0], [w, s.door[1], 0], [w, s.door[1], s.door[2]], [w, s.door[0], s.door[2]]])} />}
        {s.frontDoor && (
          <polygon className={face} points={P([[s.frontDoor[0], d, 0], [s.frontDoor[1], d, 0], [s.frontDoor[1], d, s.frontDoor[2]], [s.frontDoor[0], d, s.frontDoor[2]]])} />
        )}
        {s.roof > 0 ? (
          <>
            {/* Gable roof along the front: back slope (mostly hidden), front slope, gable on the right. */}
            <polygon className={face} points={P([[0, 0, h], [w, 0, h], [w, d / 2, h + s.roof], [0, d / 2, h + s.roof]])} />
            <polygon className={face} points={P([[0, d, h], [w, d, h], [w, d / 2, h + s.roof], [0, d / 2, h + s.roof]])} />
            <polygon className={face} points={P([[w, 0, h], [w, d, h], [w, d / 2, h + s.roof]])} />
          </>
        ) : (
          <>
            <polygon className={face} points={P([[0, 0, h], [w, 0, h], [w, d, h], [0, d, h]])} />
            <polygon className="fill-none stroke-[var(--panel-edge)]" strokeOpacity="0.6" points={P([[3, 3, h], [w - 3, 3, h], [w - 3, d - 3, h], [3, d - 3, h]])} />
          </>
        )}
      </g>
      {/* Roller shutter slats (commercial). */}
      {s.shutter &&
        s.door &&
        [3, 6, 9].map((z) => (
          <polyline key={`sh${z}`} className="fill-none stroke-[var(--panel-edge-faint)]" strokeWidth="1" points={P([[w, door[0], z], [w, door[1], z]])} />
        ))}
      {/* Neighbours' flats on the side: dark, just for scale. */}
      {s.side.map((win, i) => (
        <polygon key={`s${i}`} className="fill-none stroke-[var(--panel-edge-faint)]" strokeWidth="1" points={P([[w, win.x0, win.z0], [w, win.x1, win.z0], [w, win.x1, win.z1], [w, win.x0, win.z1]])} />
      ))}
      {s.windows.map((win, i) =>
        win.unit == null ? <polygon key={`n${i}`} className="fill-none stroke-[var(--panel-edge-faint)]" strokeWidth="1" points={winPts(win)} /> : null,
      )}
    </Link>
      {/* The landlord's own flats: each window opens its tenancy. */}
      {s.windows.map((win) => {
        const unit = win.unit == null ? undefined : b.units[win.unit];
        if (!unit) return null;
        const title = windowTitle(unit.name, unit.state);
        return (
          <Link key={unit.id} to={unit.to} aria-label={title} className="outline-none">
            <title>{title}</title>
            <polygon
              className={cn("transition-opacity duration-150 hover:opacity-70 focus-visible:opacity-70", WINDOW_CLASS[unit.state])}
              strokeWidth="1"
              strokeLinejoin="round"
              points={winPts(win)}
            />
          </Link>
        );
      })}
    </g>
  );
}

/** Index number under each building; drawn on top of the surroundings, with a halo in the panel color. */
function IndexLabel({ p }: { p: Placed }) {
  const [lx, ly] = proj([p.bx + p.s.w + 6, p.by + p.s.d + 6, 0]);
  return (
    <text
      x={lx}
      y={ly + 14}
      textAnchor="middle"
      fontSize="9"
      letterSpacing="0.08em"
      stroke="var(--panel)"
      strokeWidth="3"
      strokeLinejoin="round"
      paintOrder="stroke"
      className="fill-ink-on-panel-muted font-mono"
    >
      {String(p.index + 1).padStart(2, "0")}
    </text>
  );
}

function bounds(placed: Placed[], extra: Pt[] = []) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const pt of extra) {
    const [x, y] = proj(pt);
    xs.push(x);
    ys.push(y);
  }
  for (const { s, bx, by } of placed) {
    for (const pt of [
      [bx - 6, by - 6, 0],
      [bx + s.w + 6, by - 6, 0],
      [bx - 6, by + s.d + 6, 0],
      [bx + s.w + 6, by + s.d + 6, 0],
      [bx, by, s.h],
      [bx, by + s.d / 2, topOf(s)],
    ] as Pt[]) {
      const [x, y] = proj(pt);
      xs.push(x);
      ys.push(y);
    }
    ys.push(proj([bx + s.w + 6, by + s.d + 6, 0])[1] + 18); // index label
  }
  const pad = 14;
  let x0 = Math.min(...xs) - pad;
  let x1 = Math.max(...xs) + pad;
  let y0 = Math.min(...ys) - pad;
  let y1 = Math.max(...ys) + pad;
  // A single building would otherwise be blown up (thick lines, huge type); keep a minimum canvas and center it.
  if (x1 - x0 < MIN_W) {
    const e = (MIN_W - (x1 - x0)) / 2;
    x0 -= e;
    x1 += e;
  }
  if (y1 - y0 < MIN_H) {
    const e = (MIN_H - (y1 - y0)) / 2;
    y0 -= e;
    y1 += e;
  }
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

function Ground({ box }: { box: { x0: number; y0: number; w: number; h: number } }) {
  // Isometric lattice covering the canvas: lines along x and y at z = 0.
  const step = 14;
  const lines: ReactNode[] = [];
  const span = box.w + box.h * 2;
  for (let k = -span; k <= span; k += step) {
    const a = proj([k, -span, 0]);
    const b = proj([k, span, 0]);
    const c = proj([-span, k, 0]);
    const e = proj([span, k, 0]);
    lines.push(<line key={`a${k}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />);
    lines.push(<line key={`b${k}`} x1={c[0]} y1={c[1]} x2={e[0]} y2={e[1]} />);
  }
  return (
    <g stroke={GRID} strokeWidth="1">
      {lines}
    </g>
  );
}

const LEGEND: { state: UnitState; icon: ReactNode }[] = [
  { state: "settled", icon: <CircleCheck className="size-3.5 text-signal" aria-hidden="true" /> },
  { state: "open", icon: <Clock className="size-3.5 text-ink-on-panel-muted" aria-hidden="true" /> },
  { state: "attention", icon: <TriangleAlert className="size-3.5 text-[var(--warn-on-panel)]" aria-hidden="true" /> },
  { state: "vacant", icon: <Square className="size-3.5 text-ink-on-panel-muted" aria-hidden="true" /> },
];

export function PropertyTown({ properties }: { properties: Property[] }) {
  const { t } = useTranslation();
  const town = usePropertyTown(properties);
  const { scene, setScene } = useTownScene();
  const { placed, rows } = layout(town.buildings);
  const decor = sceneLayers(scene, rows);
  const box = bounds(placed, decor.extent);
  const stateLabel = (s: UnitState) => t(`town.state.${s}`);

  return (
    <section aria-labelledby="town-title" className="on-panel overflow-hidden rounded-md bg-panel">
      <div className="flex items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <Eyebrow onPanel>
          <span id="town-title">{t("town.eyebrow")}</span>
        </Eyebrow>
        <p className="font-mono text-[11px] leading-4 font-medium tracking-[0.08em] uppercase">
          {town.allSettled ? (
            <span className="text-signal">Kvito ✓</span>
          ) : (
            <span className="text-ink-on-panel-muted">{t("town.rented", { rented: town.rented, total: town.total })}</span>
          )}
        </p>
      </div>

      <div role="radiogroup" aria-label={t("town.scene.label")} className="flex flex-wrap items-center gap-1 px-4 pt-2 sm:px-5">
        <span className="px-1 font-mono text-[10px] leading-4 tracking-[0.08em] text-ink-on-panel-muted uppercase">{t("town.scene.label")}</span>
        {TOWN_SCENES.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={scene === v}
            onClick={() => setScene(v)}
            className={cn(
              "min-h-8 rounded-xs px-2 font-mono text-[11px] leading-4 tracking-[0.06em] uppercase transition-colors duration-150",
              scene === v ? "bg-ink-on-panel/10 text-ink-on-panel" : "text-ink-on-panel-muted hover:text-ink-on-panel",
            )}
          >
            {t(`town.scene.${v}`)}
          </button>
        ))}
      </div>

      <svg viewBox={`${box.x0} ${box.y0} ${box.w} ${box.h}`} className="mx-auto block h-auto max-h-80 w-full select-none" role="group" aria-label={t("town.eyebrow")}>
        <defs>
          <radialGradient id="kv-town-fade-g" cx="50%" cy="55%" r="60%">
            <stop offset="0.5" stopColor="#fff" />
            <stop offset="1" stopColor="#000" />
          </radialGradient>
          <mask id="kv-town-fade">
            <rect x={box.x0} y={box.y0} width={box.w} height={box.h} fill="url(#kv-town-fade-g)" />
          </mask>
        </defs>
        <g mask="url(#kv-town-fade)">
          <Ground box={box} />
        </g>
        {/* Painter's order per row: surroundings behind, each building followed by the decoration in the gap to its right, then the front. */}
        {rows.map((r) => (
          <g key={r.index}>
            <g aria-hidden="true" className="pointer-events-none" strokeWidth="1">
              {decor.back.get(r.index)}
            </g>
            {placed
              .filter((p) => p.row === r.index)
              .map((p) => {
                const rented = p.b.units.filter((u) => u.state !== "vacant").length;
                return (
                  <g key={p.b.id}>
                    <Building
                      p={p}
                      label={t("town.buildingLabel", { index: p.index + 1, name: p.b.name, address: p.b.address, rented, total: p.b.units.length })}
                      windowTitle={(name, state) => `${name}: ${stateLabel(state)}`}
                    />
                    <g aria-hidden="true" className="pointer-events-none" strokeWidth="1">
                      {decor.gap.get(p.index)}
                    </g>
                  </g>
                );
              })}
            <g aria-hidden="true" className="pointer-events-none" strokeWidth="1">
              {decor.front.get(r.index)}
            </g>
          </g>
        ))}
        <g aria-hidden="true" className="pointer-events-none">
          {placed.map((p) => (
            <IndexLabel key={p.b.id} p={p} />
          ))}
        </g>
      </svg>

      <ol className="border-t border-ink-on-panel/15">
        {town.buildings.map((b, i) => {
          const rented = b.units.filter((u) => u.state !== "vacant").length;
          const attention = b.units.some((u) => u.state === "attention");
          return (
            <li key={b.id} className="border-b border-ink-on-panel/10 last:border-b-0">
              <Link to={b.to} className="group flex min-h-14 items-center gap-4 px-5 py-3 transition-colors duration-150 hover:bg-ink-on-panel/5 sm:px-6">
                <span className="font-mono text-[11px] font-medium tracking-[0.08em] text-ink-on-panel-muted">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink-on-panel">{b.name}</span>
                  <span className="block truncate text-sm text-ink-on-panel-muted">{b.address}</span>
                </span>
                {attention && (
                  <span className="flex items-center gap-1.5 text-xs text-[var(--warn-on-panel)]">
                    <TriangleAlert className="size-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">{stateLabel("attention")}</span>
                  </span>
                )}
                <span className="font-mono text-xs text-ink-on-panel-muted">
                  {rented} / {b.units.length}
                </span>
                <ArrowRight className="size-4 shrink-0 text-ink-on-panel-muted transition-colors duration-150 group-hover:text-ink-on-panel" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ol>

      <ul className="flex flex-wrap gap-x-5 gap-y-2 border-t border-ink-on-panel/15 px-5 py-3 sm:px-6">
        {LEGEND.map(({ state, icon }) => (
          <li key={state} className="flex items-center gap-1.5 text-xs text-ink-on-panel-muted">
            {icon}
            {stateLabel(state)}
            <span className="font-mono text-ink-on-panel">{town.counts[state]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
