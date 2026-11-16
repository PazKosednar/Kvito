/** Shared isometric helpers for the property town and its surroundings (scenes). */

export const C = Math.cos(Math.PI / 6);

export type Pt = readonly [number, number, number];

/** World (x along the front, y towards the viewer, z up) → screen. */
export const proj = ([x, y, z]: Pt): [number, number] => [(x - y) * C, (x + y) / 2 - z];

/** SVG points string for a list of world points. */
export const pts = (list: Pt[]) =>
  list
    .map(proj)
    .map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`)
    .join(" ");

/** Small deterministic PRNG so every drawing keeps its look between renders. */
export function seeded(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** One row of buildings, as the scenes need it: where the row starts and ends, and the free gaps between buildings. */
export interface TownRow {
  index: number;
  /** x range covered by the row's buildings. */
  x0: number;
  x1: number;
  /** Back and front edge of the row (y). */
  y0: number;
  y1: number;
  /** Free space between neighbouring buildings (outside their plots); `after` is the building index on the left. */
  gaps: { after: number; x0: number; x1: number }[];
}
