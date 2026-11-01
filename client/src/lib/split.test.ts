import { describe, expect, it } from "vitest";
import en from "@/i18n/locales/en.json";
import sl from "@/i18n/locales/sl.json";
import { splitPreview } from "./split";

const m = (id: string, extra: Partial<{ isPrimary: boolean; shareBasisPoints: number | null; personCount: number }> = {}) => ({
  id,
  isPrimary: false,
  shareBasisPoints: null,
  personCount: 1,
  ...extra,
});

describe("split preview", () => {
  it("splits like the server: exact total, leftover cent to the primary member on ties", () => {
    const parts = splitPreview(100_001, [m("a"), m("b", { isPrimary: true })], "EQUAL")!;
    expect([parts.get("a"), parts.get("b")]).toEqual([50_000, 50_001]);
  });

  it("uses percentages and persons", () => {
    expect([...splitPreview(65_000, [m("a", { shareBasisPoints: 6_000 }), m("b", { shareBasisPoints: 4_000 })], "PERCENTAGE")!.values()]).toEqual([39_000, 26_000]);
    expect([...splitPreview(90_000, [m("a", { personCount: 2 }), m("b")], "PER_PERSON")!.values()]).toEqual([60_000, 30_000]);
  });

  it("shows nothing while percentages do not add up", () => {
    expect(splitPreview(65_000, [m("a", { shareBasisPoints: 5_000 }), m("b", { shareBasisPoints: 4_000 })], "PERCENTAGE")).toBeNull();
  });
});

/** Every key exists in both languages (plural suffixes differ: Slovenian also has _two and _few). */
describe("translations", () => {
  const keys = (o: object, prefix = ""): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`.replace(/_(one|two|few|other)$/, "")]));

  it("has the same keys in Slovenian and English", () => {
    const s = new Set(keys(sl));
    const e = new Set(keys(en));
    expect([...s].filter((k) => !e.has(k))).toEqual([]);
    expect([...e].filter((k) => !s.has(k))).toEqual([]);
  });
});
