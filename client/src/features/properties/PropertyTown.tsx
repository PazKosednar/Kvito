import { ArrowRight, CircleCheck, Clock, Square, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Eyebrow } from "@/components/brand";
import { usePropertyTown, type TownBuilding, type UnitState } from "@/hooks/usePropertyTown";
import { cn } from "@/lib/utils";
import type { Property } from "@/types/domain";

/**
 * The landlord's properties as a small isometric town on the dark panel (CGP line art):
 * one building per property, one window per unit, lit by the unit's state.
 * Every property is an apartment block; only the landlord's own flats light up.
 */

const C = Math.cos(Math.PI / 6);
const EDGE = "#4a4a50";
const GRID = "#1f1f23";
const PER_ROW = 5;
const GAP = 26;
const MIN_W = 440;
const MIN_H = 170;

type Pt = readonly [number, number, number];
const proj = ([x, y, z]: Pt): [number, number] => [(x - y) * C, (x + y) / 2 - z];

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
  h: number;
  door: [number, number, number]; // on the right face: y0, y1, z1
  windows: Win[]; // front-left face, one per flat
  side: Omit<Win, "unit">[]; // right face, decorative
}

/** Small deterministic PRNG so every building keeps its look between renders. */
function seeded(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * Always an apartment block: the landlord usually owns only some flats in it.
 * The block has more flats than the landlord's units; only theirs light up (one window per unit),
 * spread over the facade, the rest stay dark.
 */
function shapeFor(b: TownBuilding): Shape {
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
  return { w: cols * cell + 12, d, h: floors * floorH + 6, door: [10, 18, 13], windows, side };
}

interface Placed {
  b: TownBuilding;
  s: Shape;
  bx: number;
  by: number;
  index: number;
}

function layout(buildings: TownBuilding[]): { placed: (Placed & { row: number })[] } {
  const placed: (Placed & { row: number })[] = [];
  let by = 0;
  for (let r = 0; r * PER_ROW < buildings.length; r++) {
    const row = buildings.slice(r * PER_ROW, r * PER_ROW + PER_ROW);
    const shapes = row.map(shapeFor);
    const depth = Math.max(...shapes.map((s) => s.d));
    let bx = 0;
    row.forEach((b, i) => {
      const s = shapes[i]!;
      placed.push({ b, s, bx, by: by + (depth - s.d), index: r * PER_ROW + i, row: r });
      bx += s.w + GAP;
    });
    // The next row stands in front: move it forward far enough that its roofs stay below this row's plots.
    const next = buildings.slice((r + 1) * PER_ROW, (r + 2) * PER_ROW).map(shapeFor);
    const tallest = next.length ? Math.max(...next.map((s) => s.h)) : 0;
    by += depth + GAP + 2 * tallest;
  }
  return { placed };
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
  const face = cn("fill-[var(--panel)] transition-colors duration-200 stroke-[#4a4a50] group-hover:stroke-ink-on-panel-muted group-focus-visible:stroke-signal");
  const dash = empty ? "3 3" : undefined;
  const [lx, ly] = proj([bx + w + 6, by + d + 6, 0]);

  return (
    <g className="group">
    <Link to={b.to} aria-label={label} className="outline-none">
      <title>{label}</title>
      {/* Plot. */}
      <polygon points={P([[-6, -6, 0], [w + 6, -6, 0], [w + 6, d + 6, 0], [-6, d + 6, 0]])} fill="none" stroke={EDGE} strokeOpacity="0.45" strokeDasharray="2 3" />
      <g strokeWidth="1" strokeLinejoin="round" strokeDasharray={dash}>
        <polygon className={face} points={P([[0, d, 0], [w, d, 0], [w, d, h], [0, d, h]])} />
        <polygon className={face} points={P([[w, 0, 0], [w, d, 0], [w, d, h], [w, 0, h]])} />
        <polygon className={face} points={P([[w, s.door[0], 0], [w, s.door[1], 0], [w, s.door[1], s.door[2]], [w, s.door[0], s.door[2]]])} />
        <polygon className={face} points={P([[0, 0, h], [w, 0, h], [w, d, h], [0, d, h]])} />
        <polygon className="fill-none stroke-[#4a4a50]" strokeOpacity="0.6" points={P([[3, 3, h], [w - 3, 3, h], [w - 3, d - 3, h], [3, d - 3, h]])} />
      </g>
      {/* Neighbours' flats on the side: dark, just for scale. */}
      {s.side.map((win, i) => (
        <polygon key={`s${i}`} className="fill-none stroke-[#2e2e33]" strokeWidth="1" points={P([[w, win.x0, win.z0], [w, win.x1, win.z0], [w, win.x1, win.z1], [w, win.x0, win.z1]])} />
      ))}
      {s.windows.map((win, i) =>
        win.unit == null ? <polygon key={`n${i}`} className="fill-none stroke-[#2e2e33]" strokeWidth="1" points={winPts(win)} /> : null,
      )}
      <text
        x={lx}
        y={ly + 14}
        textAnchor="middle"
        fontSize="9"
        letterSpacing="0.08em"
        className="fill-ink-on-panel-muted font-mono transition-colors duration-200 group-hover:fill-ink-on-panel group-focus-visible:fill-signal"
      >
        {String(p.index + 1).padStart(2, "0")}
      </text>
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

function bounds(placed: Placed[]) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const { s, bx, by } of placed) {
    for (const pt of [
      [bx - 6, by - 6, 0],
      [bx + s.w + 6, by - 6, 0],
      [bx - 6, by + s.d + 6, 0],
      [bx + s.w + 6, by + s.d + 6, 0],
      [bx, by, s.h],
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
  const { placed } = layout(town.buildings);
  const box = bounds(placed);
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
        {placed.map((p) => {
          const rented = p.b.units.filter((u) => u.state !== "vacant").length;
          return (
            <Building
              key={p.b.id}
              p={p}
              label={t("town.buildingLabel", { index: p.index + 1, name: p.b.name, address: p.b.address, rented, total: p.b.units.length })}
              windowTitle={(name, state) => `${name}: ${stateLabel(state)}`}
            />
          );
        })}
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
