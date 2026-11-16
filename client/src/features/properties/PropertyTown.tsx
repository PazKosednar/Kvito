import { ArrowRight, Car, ChevronDown, CircleCheck, Clock, Square, SquareDashed, Trees, TriangleAlert, Wheat, type LucideIcon } from "lucide-react";
import { useContext, useId } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Eyebrow } from "@/components/brand";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePropertyTown, type TownBuilding, type UnitState } from "@/hooks/usePropertyTown";
import { DAY_TIME_CHOICES, SEASON_CHOICES, useTownAmbient, type DayTimeChoice, type SeasonChoice } from "@/hooks/useTownAmbient";
import { useTownScene } from "@/hooks/useTownScene";
import { cn } from "@/lib/utils";
import type { Property } from "@/types/domain";
import { proj, seeded, type Pt, type TownRow } from "./townGeometry";
import { sceneLayers, Shrub, TOWN_SCENES, TownAmbientContext, type TownScene } from "./townScenes";

/**
 * The landlord's properties as a small isometric town on the panel (CGP line art, follows the theme):
 * one building per property, one window per unit, lit by the unit's state.
 * The building follows the property type: a small gabled house, a larger gabled multi-unit house with a front
 * entrance, an apartment block (in both of those only the landlord's flats light up among the neighbours')
 * or a low commercial building with ribbon windows and a shutter door.
 */

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
  /** Window on a plane facing right (x = planeX, x0/x1 are then y): side wall or dormer of the house. */
  planeX?: number;
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
  /** Roof overhang beyond the walls (gable roofs). */
  eave: number;
  /** Chimney position on the roof (x, behind the ridge), or null. */
  chimney: number | null;
  /** Small attic window in the gable (right face). */
  gableWindow: boolean;
  /** Canopy and step at the front door. */
  canopy: boolean;
  /** Window sills and a plinth line on the walls. */
  sills: boolean;
  windows: Win[]; // front-left face, one per unit
  side: Omit<Win, "unit">[]; // right face, decorative
  /** Single-family house: gable to the front, porch on the side, dormer and chimney (drawn by <Cottage>). */
  cottage?: { dormerX: number; dormerY: number };
}

/** Highest point of the shape (walls + roof). */
const topOf = (s: Shape) => s.h + s.roof + (s.chimney != null ? 8 : 0);

/** Defaults for the optional details, so each shape only names what it uses. */
const PLAIN = { eave: 0, chimney: null, gableWindow: false, canopy: false, sills: false } as const;

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
  return { w: cols * cell + 12, d, h: floors * floorH + 6, roof: 0, door: [10, 18, 13], frontDoor: null, shutter: false, ...PLAIN, windows, side };
}

/**
 * Single-family house (smaller than the multi-unit house): one storey under a gable roof facing the front,
 * an attic window in the gable, a dormer and a chimney on the side slope, and the entrance with a porch,
 * pillars and steps on the side. Windows have awnings. The landlord owns the whole house, so windows light up
 * in order (front, side, attic, dormer); spare windows stay dark. More units make the house longer.
 */
function houseShape(b: TownBuilding): Shape {
  const n = b.units.length;
  const w = 34;
  const h = 19;
  const r = 17;
  const sideCount = Math.max(1, n - 4);
  const d = 24 + sideCount * 10 + 3;
  const dormerX = w - 6;
  const dormerY = Math.round(d * 0.55);
  const ridge = h + r;
  const slopeZ = (x: number) => ridge - (x - w / 2) * (r / (w / 2));
  const zb = slopeZ(dormerX);
  const slots: Omit<Win, "unit">[] = [
    { x0: 5, x1: 12, z0: 5, z1: 14 },
    { x0: 22, x1: 29, z0: 5, z1: 14 },
    ...Array.from({ length: sideCount }, (_, i) => ({ x0: 25 + i * 10, x1: 32 + i * 10, z0: 5, z1: 14, planeX: w })),
    { x0: 14, x1: 20, z0: h + 4, z1: h + 10 },
    { x0: dormerY - 2.5, x1: dormerY + 2.5, z0: zb + 1.5, z1: zb + 4.5, planeX: dormerX },
  ];
  const windows: Win[] = slots.map((win, i) => ({ ...win, unit: i < n ? i : null }));
  return {
    w,
    d,
    h,
    roof: r,
    door: null,
    frontDoor: null,
    shutter: false,
    ...PLAIN,
    eave: 3,
    chimney: w / 2 + 3,
    windows,
    side: [],
    cottage: { dormerX, dormerY },
  };
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
  return {
    w: cols * cell + 12,
    d,
    h: floors * floorH + 5,
    roof: d / 2 + 5,
    door: null,
    frontDoor: [dx, dx + 11, 14],
    shutter: false,
    ...PLAIN,
    eave: 3,
    sills: true,
    windows,
    side,
  };
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
  return { w: cols * cell + 12, d, h: floors * floorH + 6, roof: 0, door: [7, 27, 13], frontDoor: null, shutter: true, ...PLAIN, windows, side };
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
  const winPts = (win: Win) =>
    win.planeX != null
      ? P([[win.planeX, win.x0, win.z0], [win.planeX, win.x1, win.z0], [win.planeX, win.x1, win.z1], [win.planeX, win.x0, win.z1]])
      : P([[win.x0, d, win.z0], [win.x1, d, win.z0], [win.x1, d, win.z1], [win.x0, d, win.z1]]);
  const face = cn("fill-[var(--panel)] transition-colors duration-200 stroke-[var(--panel-edge)] group-hover:stroke-ink-on-panel-muted group-focus-visible:stroke-signal");
  const door = s.door ?? [0, 0, 0];
  const { dayTime, season } = useContext(TownAmbientContext);
  const night = dayTime === "night";
  const winter = season === "winter";
  // At night some of the other windows are lit (decoration, never a status); the same ones every time.
  const salt = Math.floor(seeded(`glow-${b.id}`)() * 1000);
  const glow = (i: number) => night && (Math.imul(i + salt, 2654435761) >>> 0) % 100 < 55;
  const dark = "fill-none stroke-[var(--panel-edge-faint)]";
  const lit = "fill-[var(--night-glow)] stroke-[var(--panel-edge-faint)]";

  return (
    <g className="group">
    <Link to={b.to} aria-label={label} className="outline-none">
      <title>{label}</title>
      {/* Plot. */}
      {/* Plot: a quiet solid footprint (the house's steps reach a bit further out). */}
      <polygon
        points={P([[-4, -4, 0], [w + (s.cottage ? 11 : 4), -4, 0], [w + (s.cottage ? 11 : 4), d + 4, 0], [-4, d + 4, 0]])}
        fill="none"
        className="stroke-[var(--panel-edge-faint)]"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <g strokeWidth="1" strokeLinejoin="round" strokeLinecap="round">
        {s.cottage ? (
          <Cottage s={s} P={P} face={face} />
        ) : (
          <>
        <polygon className={face} points={P([[0, d, 0], [w, d, 0], [w, d, h], [0, d, h]])} />
        <polygon className={face} points={P([[w, 0, 0], [w, d, 0], [w, d, h], [w, 0, h]])} />
        {s.door && <polygon className={face} points={P([[w, s.door[0], 0], [w, s.door[1], 0], [w, s.door[1], s.door[2]], [w, s.door[0], s.door[2]]])} />}
        {s.frontDoor && (
          <polygon className={face} points={P([[s.frontDoor[0], d, 0], [s.frontDoor[1], d, 0], [s.frontDoor[1], d, s.frontDoor[2]], [s.frontDoor[0], d, s.frontDoor[2]]])} />
        )}
        {s.sills && (
          <>
            {/* Plinth along the bottom of the walls. */}
            <polyline className="fill-none stroke-[var(--panel-edge-faint)]" points={P([[0, d, 3], [w, d, 3], [w, 0, 3]])} />
            {s.windows.map((win, i) => (
              <polyline key={`sl${i}`} className="fill-none stroke-[var(--panel-edge)]" points={P([[win.x0 - 1, d, win.z0 - 1.5], [win.x1 + 1, d, win.z0 - 1.5]])} />
            ))}
          </>
        )}
        {s.canopy && s.frontDoor && (
          <>
            {/* Step and canopy at the front door. */}
            <polygon className={face} points={P([[s.frontDoor[0] - 2, d + 3, 0], [s.frontDoor[1] + 2, d + 3, 0], [s.frontDoor[1] + 2, d + 3, 1.5], [s.frontDoor[0] - 2, d + 3, 1.5]])} />
            <polygon className={face} points={P([[s.frontDoor[0] - 2, d, 1.5], [s.frontDoor[1] + 2, d, 1.5], [s.frontDoor[1] + 2, d + 3, 1.5], [s.frontDoor[0] - 2, d + 3, 1.5]])} />
            <polygon className={face} points={P([[s.frontDoor[0] - 2, d, s.frontDoor[2] + 2], [s.frontDoor[1] + 2, d, s.frontDoor[2] + 2], [s.frontDoor[1] + 2, d + 4, s.frontDoor[2] + 1], [s.frontDoor[0] - 2, d + 4, s.frontDoor[2] + 1]])} />
          </>
        )}
        {s.roof > 0 ? (
          <GableRoof s={s} P={P} face={face} />
        ) : (
          <>
            <polygon className={face} points={P([[0, 0, h], [w, 0, h], [w, d, h], [0, d, h]])} />
            <polygon
              className={winter ? "fill-[var(--snow)] stroke-[var(--panel-edge)]" : "fill-none stroke-[var(--panel-edge)]"}
              strokeOpacity={winter ? undefined : "0.6"}
              points={P([[3, 3, h], [w - 3, 3, h], [w - 3, d - 3, h], [3, d - 3, h]])}
            />
          </>
        )}
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
        <polygon key={`s${i}`} className={glow(100 + i) ? lit : dark} strokeWidth="1" points={P([[w, win.x0, win.z0], [w, win.x1, win.z0], [w, win.x1, win.z1], [w, win.x0, win.z1]])} />
      ))}
      {s.windows.map((win, i) =>
        win.unit == null ? <polygon key={`n${i}`} className={glow(i) ? lit : dark} strokeWidth="1" points={winPts(win)} /> : null,
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
      {/* Garden along the facade: one bush per three months paid on time (reward, decoration only). */}
      {gardenSpots(s, b.garden ?? 0).map((x) => (
        <g key={`g${x}`} aria-hidden="true" className="pointer-events-none" strokeWidth="1">
          <Shrub x={bx + x} y={by + d + 3.2} s={0.7} />
        </g>
      ))}
    </g>
  );
}

/** x positions (along the facade) for the reward bushes, keeping the front door clear. */
function gardenSpots(s: Shape, count: number): number[] {
  const spots: number[] = [];
  for (let x = 5; x <= s.w - 4 && spots.length < count; x += 8) {
    if (s.frontDoor && x > s.frontDoor[0] - 5 && x < s.frontDoor[1] + 5) continue;
    spots.push(x);
  }
  return spots;
}

/**
 * Single-family house in the town's line style (after a classic cottage): front wall with the gable, side wall
 * with the entrance under a porch (pillars, canopy, steps), awnings over the windows, the side roof slope with
 * a dormer and a chimney, barge boards and fascia. Windows themselves are drawn by <Building> on top.
 * Painter's order: hidden left slope, walls, porch, awnings, side slope (+ snow), chimney, dormer, boards.
 */
function Cottage({ s, P, face }: { s: Shape; P: (pts: Pt[]) => string; face: string }) {
  const snow = useContext(TownAmbientContext).season === "winter";
  const { w, d, h, roof: r, eave: e } = s;
  const { dormerX: xd, dormerY: yc } = s.cottage!;
  const half = w / 2;
  const k = r / half; // roof slope
  const ridge = h + r;
  const ze = h - e * k;
  const t = 1.6;
  const z = (x: number) => ridge - (x - half) * k; // roof height over x (side slope)
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, key: string) => (
    <g key={key}>
      <polygon className={face} points={P([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]])} />
      <polygon className={face} points={P([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]])} />
      <polygon className={face} points={P([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]])} />
    </g>
  );
  const awning = (win: Win, i: number) =>
    win.planeX === w ? (
      <polygon key={`aw${i}`} className={face} points={P([[w, win.x0 - 1, win.z1 + 3], [w, win.x1 + 1, win.z1 + 3], [w + 3, win.x1 + 1, win.z1 + 1.5], [w + 3, win.x0 - 1, win.z1 + 1.5]])} />
    ) : win.planeX == null && win.z0 < h ? (
      <polygon key={`aw${i}`} className={face} points={P([[win.x0 - 1, d, win.z1 + 3], [win.x1 + 1, d, win.z1 + 3], [win.x1 + 1, d + 3, win.z1 + 1.5], [win.x0 - 1, d + 3, win.z1 + 1.5]])} />
    ) : null;
  const sill = (win: Win, i: number) =>
    win.planeX === w ? (
      <polyline key={`sl${i}`} className="fill-none stroke-[var(--panel-edge)]" points={P([[w, win.x0 - 1, win.z0 - 1.2], [w, win.x1 + 1, win.z0 - 1.2]])} />
    ) : win.planeX == null ? (
      <polyline key={`sl${i}`} className="fill-none stroke-[var(--panel-edge)]" points={P([[win.x0 - 1, d, win.z0 - 1.2], [win.x1 + 1, d, win.z0 - 1.2]])} />
    ) : null;
  // Dormer on the side slope: front wall at x = xd, 10 wide, gable peak; its roof meets the main slope.
  const y0 = yc - 5;
  const y1 = yc + 5;
  const zb = z(xd);
  const zw = zb + 6;
  const zp = zw + 3.5;
  const xb = half + (ridge - zw) / k;
  const xr = half + (ridge - zp) / k;
  // Chimney on the back of the side slope.
  const cx0 = s.chimney ?? half + 3;
  const cx1 = cx0 + 5;
  const top = ridge + 7;
  return (
    <>
      {/* Left slope (faces away; only its front overhang shows). */}
      <polygon className={face} points={P([[-e, -e, ze], [-e, d + e, ze], [half, d + e, ridge], [half, -e, ridge]])} />
      {/* Walls: front with the gable, side. */}
      <polygon className={face} points={P([[0, d, 0], [w, d, 0], [w, d, h], [half, d, ridge], [0, d, h]])} />
      <polygon className={face} points={P([[w, 0, 0], [w, d, 0], [w, d, h], [w, 0, h]])} />
      <polyline className="fill-none stroke-[var(--panel-edge-faint)]" points={P([[0, d, 3], [w, d, 3], [w, 0, 3]])} />
      {/* Entrance on the side: door, porch floor, steps, pillars, canopy. */}
      <polygon className={face} points={P([[w, 9, 2], [w, 16, 2], [w, 16, 14], [w, 9, 14]])} />
      {box(w, w + 5, 6, 19, 0, 2, "floor")}
      {box(w + 5, w + 7, 8, 17, 0, 1.3, "st1")}
      {box(w + 7, w + 9, 8, 17, 0, 0.6, "st2")}
      {box(w + 3.6, w + 4.8, 6.4, 7.6, 2, 15, "p1")}
      {box(w + 3.6, w + 4.8, 17.4, 18.6, 2, 15, "p2")}
      {box(w, w + 5.5, 5.5, 19.5, 15, 16.2, "canopy")}
      {s.windows.map(sill)}
      {s.windows.map(awning)}
      {/* Side slope with eave overhang. */}
      <polygon className={face} points={P([[w + e, -e, ze], [w + e, d + e, ze], [half, d + e, ridge], [half, -e, ridge]])} />
      {snow && <CottageSnow s={s} P={P} />}
      {/* Chimney: bottom follows the slope. */}
      <polygon className={face} points={P([[cx0, 11, z(cx0)], [cx1, 11, z(cx1)], [cx1, 11, top], [cx0, 11, top]])} />
      <polygon className={face} points={P([[cx1, 6, z(cx1)], [cx1, 11, z(cx1)], [cx1, 11, top], [cx1, 6, top]])} />
      <polygon className={face} points={P([[cx0 - 0.6, 5.4, top], [cx1 + 0.6, 5.4, top], [cx1 + 0.6, 11.6, top], [cx0 - 0.6, 11.6, top]])} />
      {/* Dormer. */}
      <polygon className={face} points={P([[xd, y0, zw], [xd, yc, zp], [xr, yc, zp], [xb, y0, zw]])} />
      <polygon className={face} points={P([[xd, y1, zb], [xd, y1, zw], [xb, y1, zw]])} />
      <polygon className={face} points={P([[xd, y0, zb], [xd, y1, zb], [xd, y1, zw], [xd, yc, zp], [xd, y0, zw]])} />
      <polygon className={face} points={P([[xd, y1, zw], [xd, yc, zp], [xr, yc, zp], [xb, y1, zw]])} />
      {/* Barge boards on the front gable and fascia along the side eave. */}
      <polygon className={face} points={P([[-e, d + e, ze], [half, d + e, ridge], [half, d + e, ridge - t], [-e, d + e, ze - t]])} />
      <polygon className={face} points={P([[half, d + e, ridge], [w + e, d + e, ze], [w + e, d + e, ze - t], [half, d + e, ridge - t]])} />
      <polygon className={face} points={P([[w + e, -e, ze], [w + e, d + e, ze], [w + e, d + e, ze - t], [w + e, -e, ze - t]])} />
    </>
  );
}

/** Snow on the upper part of the cottage's side slope, with a soft wavy lower edge. */
function CottageSnow({ s, P }: { s: Shape; P: (pts: Pt[]) => string }) {
  const { w, d, h, roof: r, eave: e } = s;
  const half = w / 2;
  const ridge = h + r;
  // Point on the side slope at fraction f from the ridge (0) to the eave (1), at depth y.
  const at = (y: number, f: number): Pt => [half + (half + e) * f, y, ridge - (r + e * (r / half)) * f];
  const lower: Pt[] = [];
  const steps = Math.max(4, Math.round((d + 2 * e) / 6));
  for (let i = steps; i >= 0; i--) {
    const y = -e + ((d + 2 * e) * i) / steps;
    lower.push(at(y, i % 2 ? 0.5 : 0.58));
  }
  return <polygon className="fill-[var(--snow)] stroke-[var(--panel-edge)]" strokeLinejoin="round" points={P([at(-e, 0), at(d + e, 0), ...lower])} />;
}

/**
 * Gable roof along the front, with eaves (overhang `e`) and barge boards; optional chimney and attic window.
 * Order: back slope (mostly hidden), gable wall, attic window, chimney (behind the ridge), front slope, edges.
 */
function GableRoof({ s, P, face }: { s: Shape; P: (pts: Pt[]) => string; face: string }) {
  const snow = useContext(TownAmbientContext).season === "winter";
  const { w, d, h, roof: r, eave: e } = s;
  const drop = e * (r / (d / 2)); // the slope continues down over the overhang
  const ze = h - drop;
  const t = 1.6; // board thickness
  const ridge = h + r;
  const cx = s.chimney;
  return (
    <>
      <polygon className={face} points={P([[-e, -e, ze], [w + e, -e, ze], [w + e, d / 2, ridge], [-e, d / 2, ridge]])} />
      <polygon className={face} points={P([[w, 0, h], [w, d, h], [w, d / 2, ridge]])} />
      {s.gableWindow && (
        <polygon className="fill-none stroke-[var(--panel-edge-faint)]" points={P([[w, d / 2 - 3, h + 4], [w, d / 2 + 3, h + 4], [w, d / 2 + 3, h + 10], [w, d / 2 - 3, h + 10]])} />
      )}
      {cx != null && (
        <>
          {/* Chimney straddling the back of the ridge: lower part is hidden by the front slope. */}
          <polygon className={face} points={P([[cx, d / 2 - 1, ridge - 6], [cx + 5, d / 2 - 1, ridge - 6], [cx + 5, d / 2 - 1, ridge + 8], [cx, d / 2 - 1, ridge + 8]])} />
          <polygon className={face} points={P([[cx + 5, d / 2 - 6, ridge - 6], [cx + 5, d / 2 - 1, ridge - 6], [cx + 5, d / 2 - 1, ridge + 8], [cx + 5, d / 2 - 6, ridge + 8]])} />
          <polygon className={face} points={P([[cx - 0.5, d / 2 - 6.5, ridge + 8], [cx + 5.5, d / 2 - 6.5, ridge + 8], [cx + 5.5, d / 2 - 0.5, ridge + 8], [cx - 0.5, d / 2 - 0.5, ridge + 8]])} />
        </>
      )}
      <polygon className={face} points={P([[-e, d + e, ze], [w + e, d + e, ze], [w + e, d / 2, ridge], [-e, d / 2, ridge]])} />
      {snow && <RoofSnow s={s} P={P} />}
      {/* Fascia along the front eave and barge boards on the gable end. */}
      <polygon className={face} points={P([[-e, d + e, ze], [w + e, d + e, ze], [w + e, d + e, ze - t], [-e, d + e, ze - t]])} />
      <polygon className={face} points={P([[w + e, d + e, ze], [w + e, d / 2, ridge], [w + e, d / 2, ridge - t], [w + e, d + e, ze - t]])} />
      <polygon className={face} points={P([[w + e, -e, ze], [w + e, d / 2, ridge], [w + e, d / 2, ridge - t], [w + e, -e, ze - t]])} />
    </>
  );
}

/** Snow on the upper part of the front roof slope, with a soft wavy lower edge. */
function RoofSnow({ s, P }: { s: Shape; P: (pts: Pt[]) => string }) {
  const { w, d, h, roof: r, eave: e } = s;
  const ridge = h + r;
  // Point on the front slope at depth fraction f (0 = ridge, 1 = eave).
  const at = (x: number, f: number): Pt => [x, d / 2 + (d / 2 + e) * f, ridge - (r + e * (r / (d / 2))) * f];
  const lower: Pt[] = [];
  const steps = Math.max(4, Math.round((w + 2 * e) / 6));
  for (let i = steps; i >= 0; i--) {
    const x = -e + ((w + 2 * e) * i) / steps;
    lower.push(at(x, i % 2 ? 0.5 : 0.58));
  }
  return <polygon className="fill-[var(--snow)] stroke-[var(--panel-edge)]" strokeLinejoin="round" points={P([at(-e, 0), at(w + e, 0), ...lower])} />;
}

/** Sky: sun by day; moon, stars and a faint tint by night; snowflakes are drawn separately on top. */
function Sky({ box }: { box: Box }) {
  const { dayTime } = useContext(TownAmbientContext);
  const cx = box.x0 + Math.min(46, box.w * 0.1);
  const cy = box.y0 + 18;
  if (dayTime === "day") {
    return (
      <g aria-hidden="true" stroke="var(--panel-edge-faint)" fill="none">
        <circle cx={cx} cy={cy} r={7} />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return <line key={i} x1={cx + Math.cos(a) * 10} y1={cy + Math.sin(a) * 10} x2={cx + Math.cos(a) * 13} y2={cy + Math.sin(a) * 13} />;
        })}
      </g>
    );
  }
  const rnd = seeded(`stars-${Math.round(box.w)}`);
  const stars = Array.from({ length: 16 }, () => [box.x0 + rnd() * box.w, box.y0 + 8 + rnd() * box.h * 0.32, rnd()] as const);
  return (
    <g aria-hidden="true">
      {stars.map(([x, y, k], i) =>
        k > 0.6 ? (
          <path key={i} d={`M${x - 2.2},${y}H${x + 2.2}M${x},${y - 2.2}V${y + 2.2}`} stroke="var(--panel-edge)" strokeWidth="0.8" />
        ) : (
          <circle key={i} cx={x} cy={y} r={0.9} fill="var(--panel-edge)" />
        ),
      )}
      <path
        d={`M${cx},${cy - 8} A8,8 0 1,0 ${cx},${cy + 8} A6,8 0 1,1 ${cx},${cy - 8} Z`}
        fill="var(--night-glow)"
        stroke="var(--panel-edge)"
        strokeLinejoin="round"
      />
    </g>
  );
}

/** Winter: a light snowfall over the whole canvas (static dots). */
function Snowfall({ box }: { box: Box }) {
  const { season } = useContext(TownAmbientContext);
  if (season !== "winter") return null;
  const rnd = seeded(`snow-${Math.round(box.w)}-${Math.round(box.h)}`);
  const flakes = Array.from({ length: Math.round((box.w * box.h) / 2600) }, () => [box.x0 + rnd() * box.w, box.y0 + rnd() * box.h] as const);
  return (
    <g aria-hidden="true" className="pointer-events-none">
      {flakes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.1} fill="var(--snow)" stroke="var(--panel-edge-faint)" strokeWidth="0.6" />
      ))}
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

function bounds(placed: Placed[], extra: Pt[] = [], minW = MIN_W, minH = MIN_H) {
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
  // Extra band on top for the sky (sun, moon, stars), so they never sit on a roof.
  let y0 = Math.min(...ys) - pad - 26;
  let y1 = Math.max(...ys) + pad;
  // A single building would otherwise be blown up (thick lines, huge type); keep a minimum canvas and center it.
  if (x1 - x0 < minW) {
    const e = (minW - (x1 - x0)) / 2;
    x0 -= e;
    x1 += e;
  }
  if (y1 - y0 < minH) {
    const e = (minH - (y1 - y0)) / 2;
    y0 -= e;
    y1 += e;
  }
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

type Box = { x0: number; y0: number; w: number; h: number };

function Ground({ box }: { box: Box }) {
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

const SCENE_ICONS: Record<TownScene, LucideIcon> = { none: SquareDashed, park: Trees, city: Car, countryside: Wheat };

/** Small dropdown in the corner of the scene: which surroundings to draw around the buildings. */
function ScenePicker({
  scene,
  onChange,
  ambient,
}: {
  scene: TownScene;
  onChange: (s: TownScene) => void;
  ambient: ReturnType<typeof useTownAmbient>;
}) {
  const { t } = useTranslation();
  const Icon = SCENE_ICONS[scene];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${t("town.scene.label")}: ${t(`town.scene.${scene}`)}`}
        className="absolute top-1 right-3 z-10 inline-flex min-h-9 items-center gap-1.5 rounded-xs px-2 font-mono text-[11px] leading-4 tracking-[0.06em] text-ink-on-panel-muted uppercase transition-colors duration-150 hover:bg-ink-on-panel/5 hover:text-ink-on-panel focus-visible:outline-2 sm:right-4"
      >
        <Icon className="size-3.5" aria-hidden="true" />
        {t(`town.scene.${scene}`)}
        <ChevronDown className="size-3" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="max-h-[70vh] w-48 overflow-y-auto rounded-md p-1.5">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{t("town.scene.label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={scene} onValueChange={(v) => onChange(v as TownScene)}>
          {TOWN_SCENES.map((v) => {
            const ItemIcon = SCENE_ICONS[v];
            return (
              <DropdownMenuRadioItem key={v} value={v} className="min-h-11">
                <ItemIcon aria-hidden="true" />
                {t(`town.scene.${v}`)}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{t("town.time.label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={ambient.dayTimeChoice} onValueChange={(v) => ambient.setDayTime(v as DayTimeChoice)}>
          {DAY_TIME_CHOICES.map((v) => (
            <DropdownMenuRadioItem key={v} value={v} className="min-h-10">
              {t(`town.time.${v}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{t("town.season.label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={ambient.seasonChoice} onValueChange={(v) => ambient.setSeason(v as SeasonChoice)}>
          {SEASON_CHOICES.map((v) => (
            <DropdownMenuRadioItem key={v} value={v} className="min-h-10">
              {t(`town.season.${v}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The town drawing itself (shared by the landlord's overview and the tenant's own building):
 * buildings, surroundings, day/night and season, plus the small picker in the corner.
 */
export function TownCanvas({
  buildings,
  label,
  picker = true,
  showIndex = true,
  compact = false,
  className,
}: {
  buildings: TownBuilding[];
  label: string;
  picker?: boolean;
  /** Number under each building (01, 02 …); off when there is only the tenant's own building. */
  showIndex?: boolean;
  /** Tighter minimum canvas (a single building drawn larger). */
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const { scene, setScene } = useTownScene();
  const ambient = useTownAmbient();
  const { placed, rows } = layout(buildings);
  const decor = sceneLayers(scene, rows);
  const box = compact ? bounds(placed, decor.extent, 260, 150) : bounds(placed, decor.extent);
  const stateLabel = (s: UnitState) => t(`town.state.${s}`);
  const fadeId = `kv-town-fade-${useId().replace(/:/g, "")}`;

  return (
    <div className={cn("relative", className)}>
      {picker && <ScenePicker scene={scene} onChange={setScene} ambient={ambient} />}
      <TownAmbientContext.Provider value={{ dayTime: ambient.dayTime, season: ambient.season }}>
        <svg viewBox={`${box.x0} ${box.y0} ${box.w} ${box.h}`} className="mx-auto block h-auto max-h-80 w-full select-none" role="group" aria-label={label}>
          <defs>
            <radialGradient id={`${fadeId}-g`} cx="50%" cy="55%" r="60%">
              <stop offset="0.5" stopColor="#fff" />
              <stop offset="1" stopColor="#000" />
            </radialGradient>
            <mask id={fadeId}>
              <rect x={box.x0} y={box.y0} width={box.w} height={box.h} fill={`url(#${fadeId}-g)`} />
            </mask>
          </defs>
          <g mask={`url(#${fadeId})`}>
            <Ground box={box} />
            {/* Night: a faint tint that fades out towards the edges together with the ground grid. */}
            {ambient.dayTime === "night" && <rect x={box.x0} y={box.y0} width={box.w} height={box.h} fill="var(--night-tint)" />}
          </g>
          <Sky box={box} />
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
                        label={[
                          t("town.buildingLabel", { index: p.index + 1, name: p.b.name, address: p.b.address, rented, total: p.b.units.length }),
                          p.b.onTimeMonths ? t("town.onTime", { count: p.b.onTimeMonths }) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
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
          <Snowfall box={box} />
          {showIndex && (
            <g aria-hidden="true" className="pointer-events-none">
              {placed.map((p) => (
                <IndexLabel key={p.b.id} p={p} />
              ))}
            </g>
          )}
        </svg>
        {/* Moving things on their own light layer: only this overlay repaints while they move (smooth). */}
        {decor.moving.length > 0 && (
          <svg
            viewBox={`${box.x0} ${box.y0} ${box.w} ${box.h}`}
            className="pointer-events-none absolute inset-0 h-full w-full [will-change:transform]"
            aria-hidden="true"
            strokeWidth="1"
            strokeLinejoin="round"
          >
            {decor.moving}
          </svg>
        )}
      </TownAmbientContext.Provider>
    </div>
  );
}

export function PropertyTown({ properties }: { properties: Property[] }) {
  const { t } = useTranslation();
  const town = usePropertyTown(properties);
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

      <TownCanvas buildings={town.buildings} label={t("town.eyebrow")} />

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
