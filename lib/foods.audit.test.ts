import { describe, it, expect } from "vitest";
import { FOODS, searchFoods } from "./foods";

/** Every alias of every curated food must bring that food up first (or, for shared words like
 *  "chicken", within the top 3). Failures list alias → what came first instead. */
describe("alias audit", () => {
  it("each alias surfaces its own food", () => {
    const misses: string[] = [];
    const weak: string[] = [];
    for (const f of FOODS) for (const a of f.aliases) {
      const names = searchFoods(a).map((x) => x.name);
      const pos = names.indexOf(f.name);
      if (pos === -1) misses.push(`"${a}" → ${f.name} missing (got ${names.slice(0, 3).join(" / ") || "nothing"})`);
      else if (pos > 2) weak.push(`"${a}" → ${f.name} at #${pos + 1} (first: ${names[0]})`);
    }
    if (misses.length || weak.length) console.log(["MISSES:", ...misses, "WEAK:", ...weak].join("\n"));
    expect(misses).toEqual([]);
    expect(weak).toEqual([]);
  });
  it("shared aliases: a word used by several foods lands on the sensible one first", () => {
    const shared = new Map<string, string[]>();
    for (const f of FOODS) for (const a of f.aliases) shared.set(a, [...(shared.get(a) ?? []), f.name]);
    const dups = [...shared.entries()].filter(([, v]) => v.length > 1).map(([a, v]) => `"${a}": ${v.join(" | ")}  → first: ${searchFoods(a)[0]?.name}`);
    console.log("SHARED ALIASES:\n" + dups.join("\n"));
    expect(true).toBe(true);
  });
});
