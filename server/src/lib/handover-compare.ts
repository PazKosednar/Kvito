/**
 * "Before and after": pairs the items of a move-in and a move-out handover by room + item name
 * (case and extra spaces ignored) and says how each one changed. Pure, so it is unit-tested.
 */

export type Condition = "GOOD" | "WORN" | "DAMAGED" | "MISSING";

/** SAME / BETTER / WORSE: in both records. NEW: only at move-out. NOT_CHECKED: at move-in, not recorded at move-out. */
export type ItemChange = "SAME" | "BETTER" | "WORSE" | "NEW" | "NOT_CHECKED";

const RANK: Record<Condition, number> = { GOOD: 0, WORN: 1, DAMAGED: 2, MISSING: 3 };

export interface CompareItem {
  id: string;
  room: string;
  name: string;
  condition: Condition;
}

export interface CompareRow<T extends CompareItem> {
  room: string;
  name: string;
  before: T | null;
  after: T | null;
  change: ItemChange;
}

export const itemKey = (room: string, name: string) => `${norm(room)}|${norm(name)}`;
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleLowerCase("sl");

export function changeOf(before: Condition | null, after: Condition | null): ItemChange {
  if (before && !after) return "NOT_CHECKED";
  if (!before) return "NEW";
  const d = RANK[after!] - RANK[before];
  return d > 0 ? "WORSE" : d < 0 ? "BETTER" : "SAME";
}

/** Rows in move-in order (then items only found at move-out), each item used once. */
export function compareHandovers<T extends CompareItem>(moveIn: T[], moveOut: T[]): CompareRow<T>[] {
  const outByKey = new Map<string, T[]>();
  for (const it of moveOut) {
    const k = itemKey(it.room, it.name);
    outByKey.set(k, [...(outByKey.get(k) ?? []), it]);
  }
  const rows: CompareRow<T>[] = [];
  for (const before of moveIn) {
    const after = outByKey.get(itemKey(before.room, before.name))?.shift() ?? null;
    rows.push({ room: before.room, name: before.name, before, after, change: changeOf(before.condition, after?.condition ?? null) });
  }
  for (const rest of outByKey.values()) {
    for (const after of rest) rows.push({ room: after.room, name: after.name, before: null, after, change: "NEW" });
  }
  return rows;
}

/** Counts per change, for the summary line. */
export function summarize(rows: { change: ItemChange }[]): Record<ItemChange, number> {
  const s: Record<ItemChange, number> = { SAME: 0, BETTER: 0, WORSE: 0, NEW: 0, NOT_CHECKED: 0 };
  for (const r of rows) s[r.change] += 1;
  return s;
}
