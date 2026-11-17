import { describe, expect, it } from "vitest";
import { changeOf, compareHandovers, summarize, type CompareItem } from "./handover-compare.js";

const item = (id: string, room: string, name: string, condition: CompareItem["condition"]): CompareItem => ({ id, room, name, condition });

describe("changeOf", () => {
  it("compares conditions by severity", () => {
    expect(changeOf("GOOD", "GOOD")).toBe("SAME");
    expect(changeOf("GOOD", "DAMAGED")).toBe("WORSE");
    expect(changeOf("WORN", "MISSING")).toBe("WORSE");
    expect(changeOf("DAMAGED", "GOOD")).toBe("BETTER");
    expect(changeOf("GOOD", null)).toBe("NOT_CHECKED");
    expect(changeOf(null, "WORN")).toBe("NEW");
  });
});

describe("compareHandovers", () => {
  it("pairs by room and name ignoring case and spaces, keeps move-in order", () => {
    const rows = compareHandovers(
      [item("i1", "Kuhinja", "Štedilnik", "GOOD"), item("i2", "Dnevna soba", "Kavč", "GOOD"), item("i3", "Kopalnica", "Ogledalo", "GOOD")],
      [item("o1", "dnevna  soba", "kavč ", "DAMAGED"), item("o2", "KUHINJA", "štedilnik", "GOOD"), item("o3", "Balkon", "Miza", "WORN")],
    );
    expect(rows.map((r) => [r.before?.id ?? null, r.after?.id ?? null, r.change])).toEqual([
      ["i1", "o2", "SAME"],
      ["i2", "o1", "WORSE"],
      ["i3", null, "NOT_CHECKED"],
      [null, "o3", "NEW"],
    ]);
    expect(summarize(rows)).toEqual({ SAME: 1, BETTER: 0, WORSE: 1, NEW: 1, NOT_CHECKED: 1 });
  });

  it("uses each move-out item once when names repeat", () => {
    const rows = compareHandovers(
      [item("i1", "Soba", "Stol", "GOOD"), item("i2", "Soba", "Stol", "GOOD")],
      [item("o1", "Soba", "Stol", "WORN")],
    );
    expect(rows.map((r) => [r.before?.id, r.after?.id ?? null, r.change])).toEqual([
      ["i1", "o1", "WORSE"],
      ["i2", null, "NOT_CHECKED"],
    ]);
  });
});
