# Meal Patterns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save a set of today's logged meals under a name, then log the whole set again in one tap with grams adjusted on the way.

**Architecture:** One new Supabase table (`meal_patterns`, items as jsonb) with direct reads/writes in `lib/patterns-db.ts`; pure scaling/totals logic in `lib/patterns.ts` (vitest); three UI surfaces — a "Save as meal" bottom sheet on the HUB, a "Your meals" section on `/log/meal`, and a review page `/log/meal/pattern/[id]` that fans out into N ordinary `logMeal` calls through the existing offline queue.

**Tech Stack:** Next.js 16 app router (client components), Supabase JS, Tailwind tokens from `app/globals.css` (no hex in components), vitest.

**Spec:** `docs/superpowers/specs/2026-09-01-meal-patterns-design.md`

**Design references (implement FROM these, do not re-derive layouts):**
- Review page: `docs/superpowers/design/2026-09-01-pattern-review-12ui-B.png` and its HTML `docs/superpowers/design/2026-09-01-pattern-html/review/2026-09-01-pattern-review-12ui-B.html`
- Save sheet: `docs/superpowers/design/2026-09-01-pattern-save-12ui-B.png` and `docs/superpowers/design/2026-09-01-pattern-html/save/2026-09-01-pattern-save-12ui-B.html` (ignore the "GAINS" logo and top-right pills in the render — the dimmed gauge behind the sheet is the real HUB)

## Global Constraints

- Colours only via tokens (`bg-background`, `bg-surface`, `bg-surface-2`, `border-border`, `text-foreground`, `text-muted`, `text-accent`, `bg-accent`, `text-accent-foreground`, `text-success`, `text-danger`, `card-grad`). Never a hex value in a component.
- No "e1RM" or other jargon in user-facing text.
- Numbers: kcal integers; grams as entered; macros to 0.1 g in storage, integers in display.
- Every write to `meals` goes through `logMeal` from `lib/log.ts` (offline queue). Pattern CRUD is direct Supabase.
- Run before every commit: `npx tsc --noEmit && npx vitest run`. If tsc complains about `.next/types` duplicates (files like `routes.d 2.ts`), run `rm -rf .next && npx next typegen` first.
- Work in `~/code/gainz-app` on `main`; push after each task passes (`git push origin HEAD`). No worktrees (`.env.local` is untracked).
- Commit trailer on every commit:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01X86t9t18dGuSS7AAHC7wGd
  ```

---

## File structure

| File | Responsibility |
|---|---|
| `supabase/schema.sql` | append the `meal_patterns` block (he pastes it into the dashboard) |
| `lib/patterns.ts` | types + pure functions: `itemsFromMeals`, `scaleItem`, `totals`, `sortPatterns` |
| `lib/patterns.test.ts` | vitest for the above |
| `lib/patterns-db.ts` | `listPatterns`, `getPattern`, `createPattern`, `deletePattern`, `markUsed` |
| `components/SavePatternSheet.tsx` | bottom sheet: name + checklist of today's meals → `createPattern` |
| `app/(tabs)/page.tsx` | "Save as meal" action in the Today header; mounts the sheet; "Saved ✓" toast |
| `app/log/meal/page.tsx` | "Your meals" section above Recent foods when the query is empty |
| `app/log/meal/pattern/[id]/page.tsx` | review page: editable grams, totals, Log all, Delete meal |
| `AGENTS.md` | ledger entry |

---

### Task 1: Schema block + pure logic (`lib/patterns.ts`)

**Files:**
- Modify: `supabase/schema.sql` (append at end)
- Create: `lib/patterns.ts`
- Test: `lib/patterns.test.ts`

**Interfaces — Produces:**
```ts
export type Per100 = { kcal: number; protein: number; carbs: number; fat: number };
export type PatternItem = { food_name: string; grams: number; per100g: Per100; fdc_id: string | null };
export type PatternRow = { id: string; name: string; items: PatternItem[]; created_at: string; last_used_at: string | null; use_count: number };
export type MealLike = { food_name: string; grams: number; calories: number; protein_g: number; carbs_g: number; fat_g: number; fdc_id?: string | null };
export function itemsFromMeals(meals: MealLike[]): PatternItem[];
export function scaleItem(item: PatternItem, grams: number): MealEntry;   // MealEntry from lib/log.ts
export function totals(entries: MealEntry[]): { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
export function sortPatterns<T extends { last_used_at: string | null; created_at: string }>(rows: T[]): T[];
```

- [ ] **Step 1: Append the SQL block**

Append to `supabase/schema.sql`:

```sql

-- Sub-project 4a: meal patterns (2026-09-01). Paste this block once.
create table if not exists meal_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  name text not null,
  items jsonb not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  use_count integer not null default 0
);
alter table meal_patterns enable row level security;
create policy "own meal_patterns" on meal_patterns for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 2: Write the failing tests**

Create `lib/patterns.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { itemsFromMeals, scaleItem, totals, sortPatterns, type PatternItem } from "./patterns";

const yogurt: PatternItem = { food_name: "Greek yogurt, nonfat", grams: 320,
  per100g: { kcal: 59.0625, protein: 10.3125, carbs: 3.59375, fat: 0.40625 }, fdc_id: "170903" };

describe("itemsFromMeals", () => {
  it("derives per-100g from a logged row and keeps grams + fdc_id", () => {
    const [it0] = itemsFromMeals([{ food_name: "Greek yogurt, nonfat", grams: 320, calories: 189,
      protein_g: 33, carbs_g: 11.5, fat_g: 1.3, fdc_id: "170903" }]);
    expect(it0.grams).toBe(320);
    expect(it0.fdc_id).toBe("170903");
    expect(it0.per100g.kcal).toBeCloseTo(59.06, 1);
    expect(it0.per100g.protein).toBeCloseTo(10.31, 1);
  });
  it("skips rows with grams <= 0 and maps a missing fdc_id to null", () => {
    const out = itemsFromMeals([
      { food_name: "Bad", grams: 0, calories: 1, protein_g: 0, carbs_g: 0, fat_g: 0 },
      { food_name: "Honey", grams: 17, calories: 52, protein_g: 0, carbs_g: 14, fat_g: 0 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].fdc_id).toBeNull();
  });
});

describe("scaleItem", () => {
  it("scales to new grams, rounding to 0.1 like the meal page", () => {
    const e = scaleItem(yogurt, 250);
    expect(e).toEqual({ food_name: "Greek yogurt, nonfat", grams: 250, calories: 147.7,
      protein_g: 25.8, carbs_g: 9, fat_g: 1, fdc_id: "170903" });
  });
  it("omits fdc_id when the item has none", () => {
    const e = scaleItem({ ...yogurt, fdc_id: null }, 100);
    expect("fdc_id" in e).toBe(false);
  });
});

describe("totals", () => {
  it("sums and rounds to integers — today's breakfast is 810 · 54 · 92 · 27", () => {
    const t = totals([
      { food_name: "Plain bagel", grams: 105, calories: 290, protein_g: 11, carbs_g: 56, fat_g: 2 },
      { food_name: "Greek yogurt, nonfat", grams: 320, calories: 189, protein_g: 33, carbs_g: 11.5, fat_g: 1.3 },
      { food_name: "Skippy peanut butter", grams: 47, calories: 279, protein_g: 10.3, carbs_g: 10.3, fat_g: 23.5 },
      { food_name: "Honey", grams: 17, calories: 52, protein_g: 0, carbs_g: 14, fat_g: 0 },
    ]);
    expect(t).toEqual({ kcal: 810, protein_g: 54, carbs_g: 92, fat_g: 27 });
  });
  it("empty list is all zeros", () => {
    expect(totals([])).toEqual({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  });
});

describe("sortPatterns", () => {
  it("most recently used first, never-used last by newest created", () => {
    const rows = [
      { id: "a", last_used_at: null, created_at: "2026-09-01T10:00:00Z" },
      { id: "b", last_used_at: "2026-09-01T08:00:00Z", created_at: "2026-08-01T00:00:00Z" },
      { id: "c", last_used_at: "2026-09-01T09:00:00Z", created_at: "2026-08-15T00:00:00Z" },
      { id: "d", last_used_at: null, created_at: "2026-09-02T10:00:00Z" },
    ];
    expect(sortPatterns(rows).map((r) => r.id)).toEqual(["c", "b", "d", "a"]);
  });
  it("does not mutate the input", () => {
    const rows = [{ id: "x", last_used_at: null, created_at: "2026-09-01T00:00:00Z" },
      { id: "y", last_used_at: "2026-09-01T00:00:00Z", created_at: "2026-09-01T00:00:00Z" }];
    const copy = [...rows];
    sortPatterns(rows);
    expect(rows).toEqual(copy);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run lib/patterns.test.ts`
Expected: FAIL — cannot resolve `./patterns`.

- [ ] **Step 4: Implement `lib/patterns.ts`**

```ts
import type { MealEntry } from "@/lib/log";

export type Per100 = { kcal: number; protein: number; carbs: number; fat: number };
export type PatternItem = { food_name: string; grams: number; per100g: Per100; fdc_id: string | null };
export type PatternRow = { id: string; name: string; items: PatternItem[]; created_at: string;
  last_used_at: string | null; use_count: number };
export type MealLike = { food_name: string; grams: number; calories: number; protein_g: number;
  carbs_g: number; fat_g: number; fdc_id?: string | null };

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Per-100 g values from a logged row: value / grams × 100. Rows with grams ≤ 0 are skipped. */
export function itemsFromMeals(meals: MealLike[]): PatternItem[] {
  const out: PatternItem[] = [];
  for (const m of meals) {
    const g = Number(m.grams);
    if (!(g > 0)) continue;
    const s = 100 / g;
    out.push({
      food_name: m.food_name, grams: g, fdc_id: m.fdc_id ?? null,
      per100g: { kcal: Number(m.calories) * s, protein: Number(m.protein_g) * s,
        carbs: Number(m.carbs_g) * s, fat: Number(m.fat_g) * s },
    });
  }
  return out;
}

/** The meal row to log for this item at `grams`. Same 0.1 rounding as the meal page. */
export function scaleItem(item: PatternItem, grams: number): MealEntry {
  const k = grams / 100;
  const e: MealEntry = {
    food_name: item.food_name, grams,
    calories: r1(item.per100g.kcal * k), protein_g: r1(item.per100g.protein * k),
    carbs_g: r1(item.per100g.carbs * k), fat_g: r1(item.per100g.fat * k),
  };
  if (item.fdc_id) e.fdc_id = item.fdc_id;
  return e;
}

export function totals(entries: MealEntry[]) {
  const sum = (k: "calories" | "protein_g" | "carbs_g" | "fat_g") =>
    Math.round(entries.reduce((a, e) => a + e[k], 0));
  return { kcal: sum("calories"), protein_g: sum("protein_g"), carbs_g: sum("carbs_g"), fat_g: sum("fat_g") };
}

/** Most recently used first; never-used after, newest created first. Pure — returns a new array. */
export function sortPatterns<T extends { last_used_at: string | null; created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.last_used_at && b.last_used_at) return b.last_used_at.localeCompare(a.last_used_at);
    if (a.last_used_at) return -1;
    if (b.last_used_at) return 1;
    return b.created_at.localeCompare(a.created_at);
  });
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run lib/patterns.test.ts`
Expected: 8 passed. (If the `scaleItem` equality fails on 147.7 vs 147.6: 59.0625 × 2.5 = 147.65625 → r1 → 147.7. The test value is right; check the rounding helper.)

- [ ] **Step 6: Typecheck + full suite, commit, push**

```bash
npx tsc --noEmit && npx vitest run
git add supabase/schema.sql lib/patterns.ts lib/patterns.test.ts
git commit -m "feat(patterns): meal_patterns schema block + pure scaling/totals logic"
git push origin HEAD
```

---

### Task 2: Data access (`lib/patterns-db.ts`)

**Files:**
- Create: `lib/patterns-db.ts`

**Interfaces — Consumes:** `PatternItem`, `PatternRow` from Task 1. **Produces:**
```ts
export async function listPatterns(): Promise<PatternRow[]>;
export async function getPattern(id: string): Promise<PatternRow | null>;   // null when missing/deleted
export async function createPattern(name: string, items: PatternItem[]): Promise<PatternRow>;
export async function deletePattern(id: string): Promise<void>;
export async function markUsed(p: PatternRow): Promise<void>;               // last_used_at = now, use_count + 1
```

- [ ] **Step 1: Implement**

Follow the `lib/weighins.ts` pattern (throw on `error`; `auth.getUser()` for inserts):

```ts
import { supabase } from "@/lib/supabase";
import type { PatternItem, PatternRow } from "@/lib/patterns";

const COLS = "id,name,items,created_at,last_used_at,use_count";

function row(r: Record<string, unknown>): PatternRow {
  return { id: String(r.id), name: String(r.name), items: (r.items as PatternItem[]) ?? [],
    created_at: String(r.created_at), last_used_at: (r.last_used_at as string | null) ?? null,
    use_count: Number(r.use_count ?? 0) };
}

export async function listPatterns(): Promise<PatternRow[]> {
  const { data, error } = await supabase.from("meal_patterns").select(COLS);
  if (error) throw error;
  return (data ?? []).map(row);
}

export async function getPattern(id: string): Promise<PatternRow | null> {
  const { data, error } = await supabase.from("meal_patterns").select(COLS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? row(data) : null;
}

export async function createPattern(name: string, items: PatternItem[]): Promise<PatternRow> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data, error } = await supabase.from("meal_patterns")
    .insert({ user_id: user.id, name: name.trim(), items }).select(COLS).single();
  if (error) throw error;
  return row(data);
}

export async function deletePattern(id: string): Promise<void> {
  const { error } = await supabase.from("meal_patterns").delete().eq("id", id);
  if (error) throw error;
}

/** Cosmetic ordering data; callers may ignore failures. */
export async function markUsed(p: PatternRow): Promise<void> {
  const { error } = await supabase.from("meal_patterns")
    .update({ last_used_at: new Date().toISOString(), use_count: p.use_count + 1 }).eq("id", p.id);
  if (error) throw error;
}
```

- [ ] **Step 2: Typecheck, commit, push**

```bash
npx tsc --noEmit && npx vitest run
git add lib/patterns-db.ts
git commit -m "feat(patterns): Supabase access for meal_patterns"
git push origin HEAD
```

---

### Task 3: Review page `/log/meal/pattern/[id]`

**Files:**
- Create: `app/log/meal/pattern/[id]/page.tsx`

**Interfaces — Consumes:** `getPattern`, `deletePattern`, `markUsed` (Task 2); `scaleItem`, `totals` (Task 1); `logMeal` from `lib/log.ts`; `AuthGuard`. **Design:** implement from `2026-09-01-pattern-review-12ui-B.html` — read it first. Layout: back circle + title (pattern name) + subtitle "Log saved meal"; one `card-grad` card with divided rows: name over `kcal · P` muted line, right side a bordered grams input with a small "g" suffix and a ✕; a totals card with a flame glyph and four number/label pairs; full-width accent "Log all"; centered muted "Delete meal" link.

- [ ] **Step 1: Implement the page**

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import { deletePattern, getPattern, markUsed } from "@/lib/patterns-db";
import { scaleItem, totals, type PatternRow } from "@/lib/patterns";
import { logMeal } from "@/lib/log";

type Row = { key: number; food_name: string; grams: string };   // grams as typed

export default function PatternReview() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [pattern, setPattern] = useState<PatternRow | null | "missing" | undefined>(undefined);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    getPattern(id).then((p) => {
      if (!p) return setPattern("missing");
      setPattern(p);
      setRows(p.items.map((it, i) => ({ key: i, food_name: it.food_name, grams: String(it.grams) })));
    }).catch(() => setPattern("missing"));
  }, [id]);

  const entries = useMemo(() => {
    if (!pattern || pattern === "missing") return [];
    return rows.map((r) => {
      const g = parseFloat(r.grams) || 0;
      return { row: r, grams: g, entry: scaleItem(pattern.items[r.key], g) };
    });
  }, [pattern, rows]);
  const sum = totals(entries.map((e) => e.entry));
  const canLog = entries.length > 0 && entries.every((e) => e.grams > 0) && !busy;

  async function logAll() {
    if (!canLog || !pattern || pattern === "missing") return;
    setBusy(true); setErr("");
    try {
      for (const e of entries) await logMeal(e.entry);          // in order; queue keeps FIFO
      markUsed(pattern).catch(() => { /* ordering only */ });
      router.replace(`/?logged=${entries.length}`);
    } catch {
      setErr("Couldn't log. Check your connection and try again.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!pattern || pattern === "missing") return;
    if (!window.confirm(`Delete "${pattern.name}"? Today's logged meals are not affected.`)) return;
    try { await deletePattern(pattern.id); router.replace("/log/meal"); }
    catch { setErr("Couldn't delete. Try again."); }
  }

  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background px-4 pb-10 pt-6 text-foreground">
        <div className="flex items-center gap-3">
          <Link href="/log/meal" aria-label="Back"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-accent active:bg-surface-2">←</Link>
          <div>
            <h1 className="text-2xl font-bold leading-tight">{pattern && pattern !== "missing" ? pattern.name : "Saved meal"}</h1>
            <p className="text-sm text-muted">Log saved meal</p>
          </div>
        </div>

        {pattern === undefined && <p className="text-sm text-muted">Loading…</p>}
        {pattern === "missing" && (
          <p className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
            This meal was deleted. <Link href="/log/meal" className="text-accent">Back to Log meal</Link>
          </p>
        )}

        {pattern && pattern !== "missing" && (
          <>
            <ul className="card-grad divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {entries.map(({ row, entry }) => (
                <li key={row.key} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-foreground">{row.food_name}</span>
                    <span className="mt-0.5 block text-[12px] tabular-nums text-muted">
                      {Math.round(entry.calories)} kcal · {Math.round(entry.protein_g)} P
                    </span>
                  </span>
                  <label className="flex h-11 w-[104px] items-center justify-end gap-1 rounded-xl border border-border bg-surface px-3 focus-within:border-accent">
                    <input inputMode="decimal" value={row.grams} aria-label={`${row.food_name} grams`}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => setRows((rs) => rs.map((r) => r.key === row.key ? { ...r, grams: e.target.value } : r))}
                      className="w-full bg-transparent text-right text-xl font-bold tabular-nums text-accent focus:outline-none" />
                    <span className="text-sm text-muted">g</span>
                  </label>
                  <button type="button" aria-label={`Remove ${row.food_name}`}
                    onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                    className="px-1 text-lg text-accent/80 active:text-accent">×</button>
                </li>
              ))}
              {entries.length === 0 && <li className="px-4 py-3 text-sm text-muted">Nothing left to log.</li>}
            </ul>

            <div className="card-grad flex items-center justify-around rounded-2xl border border-border px-4 py-3.5 text-center">
              {([["kcal", sum.kcal], ["P", sum.protein_g], ["C", sum.carbs_g], ["F", sum.fat_g]] as const).map(([l, v]) => (
                <span key={l}>
                  <span className={`block text-2xl font-bold tabular-nums ${l === "kcal" ? "text-accent" : "text-foreground"}`}>{v}</span>
                  <span className="text-[12px] text-muted">{l}</span>
                </span>
              ))}
            </div>

            {err && <p className="text-sm text-danger">{err}</p>}
            <button type="button" onClick={logAll} disabled={!canLog}
              className="w-full rounded-2xl bg-accent px-4 py-4 text-lg font-semibold text-accent-foreground active:opacity-80 disabled:opacity-40">
              {busy ? "Logging…" : "Log all"}
            </button>
            <button type="button" onClick={remove} className="py-2 text-sm text-muted active:text-foreground">Delete meal</button>
          </>
        )}
      </main>
    </AuthGuard>
  );
}
```

- [ ] **Step 2: Typecheck (needs typegen for the new route), build once**

```bash
rm -rf .next && npx next typegen && npx tsc --noEmit && npm run build
```
Expected: clean, route `/log/meal/pattern/[id]` listed.

- [ ] **Step 3: Visual check against the render**

`npm run dev`, sign in, open `/log/meal/pattern/<any-uuid>` → "This meal was deleted." state renders. (Full data check happens in Task 5 once patterns can be created.) Compare spacing and sizes with `2026-09-01-pattern-review-12ui-B.png`; fix drift.

- [ ] **Step 4: Commit, push**

```bash
git add "app/log/meal/pattern"
git commit -m "feat(patterns): review page — adjust grams, log all through the queue, delete"
git push origin HEAD
```

---

### Task 4: "Your meals" on `/log/meal` + HUB "Logged N ✓" toast

**Files:**
- Modify: `app/log/meal/page.tsx` (search branch, above the Recent foods section)
- Modify: `app/(tabs)/page.tsx` (read `?logged=N`, show toast)

**Interfaces — Consumes:** `listPatterns` (Task 2), `sortPatterns`, `scaleItem`, `totals` (Task 1).

- [ ] **Step 1: Load patterns in `app/log/meal/page.tsx`**

Add imports and state near the other `useState` calls:

```tsx
import Link from "next/link";
import { listPatterns } from "@/lib/patterns-db";
import { scaleItem, sortPatterns, totals, type PatternRow } from "@/lib/patterns";
// …
const [patterns, setPatterns] = useState<PatternRow[]>([]);
useEffect(() => { listPatterns().then((p) => setPatterns(sortPatterns(p))).catch(() => setPatterns([])); }, []);
```

- [ ] **Step 2: Render the section**

Inside the search branch (`/* ——— search ——— */`), directly after the `<input …placeholder="Search food…" />`, before `{historyHits.length > 0 && (`:

```tsx
            {q.trim().length < 2 && patterns.length > 0 && (
              <section className="flex flex-col gap-1.5">
                <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">Your meals</h2>
                <ul className="card-grad divide-y divide-border overflow-hidden rounded-2xl border border-border">
                  {patterns.map((p) => {
                    const t = totals(p.items.map((it) => scaleItem(it, it.grams)));
                    return (
                      <li key={p.id}>
                        <Link href={`/log/meal/pattern/${p.id}`}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-semibold text-foreground">{p.name}</span>
                            <span className="mt-0.5 block text-[12px] tabular-nums text-muted">
                              {p.items.length} foods · {t.kcal} kcal · {t.protein_g} P
                            </span>
                          </span>
                          <span className="text-muted">›</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
```

- [ ] **Step 3: HUB toast for `?logged=N`**

In `app/(tabs)/page.tsx` add `import { useSearchParams, useRouter } from "next/navigation";` and inside `Hub()`:

```tsx
  const params = useSearchParams();
  const router = useRouter();
  const [toast, setToast] = useState("");
  useEffect(() => {
    const n = Number(params.get("logged"));
    if (n > 0) {
      setToast(`Logged ${n} food${n === 1 ? "" : "s"} ✓`);
      router.replace("/");
      const t = setTimeout(() => setToast(""), 2500);
      return () => clearTimeout(t);
    }
  }, [params, router]);
```

Render directly under the page's top heading/gauge container (first child of the main content column):

```tsx
        {toast && (
          <p className="rounded-xl border border-success/30 bg-success/10 px-4 py-2.5 text-sm font-medium text-success">{toast}</p>
        )}
```

`useSearchParams` in a client page needs a Suspense boundary for static export: if `npm run build` complains ("useSearchParams() should be wrapped in a suspense boundary"), wrap the exported component: rename `Hub` to `HubInner` and `export default function Hub() { return <Suspense fallback={null}><HubInner /></Suspense>; }` with `import { Suspense } from "react"`.

- [ ] **Step 4: Typecheck, build, commit, push**

```bash
npx tsc --noEmit && npx vitest run && npm run build
git add app/log/meal/page.tsx "app/(tabs)/page.tsx"
git commit -m "feat(patterns): Your meals section on Log meal; HUB logged-N toast"
git push origin HEAD
```

---

### Task 5: Save-as-meal sheet on the HUB

**Files:**
- Create: `components/SavePatternSheet.tsx`
- Modify: `app/(tabs)/page.tsx` (Today header action + mount)

**Interfaces — Consumes:** `createPattern` (Task 2), `itemsFromMeals` (Task 1), HUB's `Meal` type (`{ id, food_name, grams, calories, protein_g, carbs_g, fat_g, logged_at }`). **Design:** implement from `2026-09-01-pattern-save-12ui-B.html` — sheet with grab handle, "Save as meal" title, name field, "Today's foods" label, one grouped card of checkbox rows (`name` left, `grams g · kcal` right), accent Save, muted Cancel. Overlay/dialog mechanics copied from `components/SetSheet.tsx` (fixed inset overlay, `role="dialog"`, Escape closes).

- [ ] **Step 1: Create the sheet**

```tsx
"use client";
import { useEffect, useState } from "react";
import { createPattern } from "@/lib/patterns-db";
import { itemsFromMeals, type MealLike } from "@/lib/patterns";

type Meal = MealLike & { id: string };

export default function SavePatternSheet({ meals, onSaved, onClose }: {
  meals: Meal[]; onSaved: () => void; onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set(meals.map((m) => m.id)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const offline = typeof navigator !== "undefined" && !navigator.onLine;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canSave = name.trim().length > 0 && picked.size > 0 && !busy && !offline;

  async function save() {
    if (!canSave) return;
    setBusy(true); setErr("");
    try {
      await createPattern(name, itemsFromMeals(meals.filter((m) => picked.has(m.id))));
      onSaved();
    } catch { setErr("Couldn't save. Try again."); setBusy(false); }
  }

  return (
    <>
      <div className="fixed inset-0 z-10 bg-black/60" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="save-pattern-title"
        className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md rounded-t-3xl border-t border-border bg-surface px-4 pb-6 pt-3 shadow-2xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
        <h2 id="save-pattern-title" className="text-2xl font-bold">Save as meal</h2>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Breakfast" autoFocus
          className="mt-3 w-full rounded-2xl border border-border bg-background px-4 py-3.5 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none" />
        <p className="mt-4 text-[11px] font-medium uppercase tracking-wider text-muted">Today's foods</p>
        <ul className="mt-1.5 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background">
          {meals.map((m) => {
            const on = picked.has(m.id);
            return (
              <li key={m.id}>
                <button type="button" role="checkbox" aria-checked={on}
                  onClick={() => setPicked((s) => { const n = new Set(s); if (on) n.delete(m.id); else n.add(m.id); return n; })}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                    on ? "border-accent bg-accent text-accent-foreground" : "border-border"}`} aria-hidden>{on ? "✓" : ""}</span>
                  <span className="min-w-0 flex-1 truncate text-[15px] text-foreground">{m.food_name}</span>
                  <span className="shrink-0 text-[13px] tabular-nums text-muted">{m.grams} g · {Math.round(Number(m.calories))} kcal</span>
                </button>
              </li>
            );
          })}
        </ul>
        {offline && <p className="mt-3 text-sm text-muted">You're offline — saving a meal needs a connection.</p>}
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
        <button type="button" onClick={save} disabled={!canSave}
          className="mt-4 w-full rounded-2xl bg-accent px-4 py-4 text-lg font-semibold text-accent-foreground active:opacity-80 disabled:opacity-40">
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onClose} className="mt-2 w-full py-2 text-sm text-accent">Cancel</button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Wire it into the HUB**

In `app/(tabs)/page.tsx`: `import SavePatternSheet from "@/components/SavePatternSheet";`, state `const [saveOpen, setSaveOpen] = useState(false);`. Change the Today header from

```tsx
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">Today</h2>
```
to
```tsx
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">Today</h2>
            {meals.length > 0 && (
              <button type="button" onClick={() => setSaveOpen(true)} className="text-[12px] font-semibold text-accent active:opacity-80">
                Save as meal
              </button>
            )}
          </div>
```
and before the closing `</main>` (or the outermost fragment end) mount:
```tsx
        {saveOpen && (
          <SavePatternSheet meals={meals} onClose={() => setSaveOpen(false)}
            onSaved={() => { setSaveOpen(false); setToast("Saved ✓"); setTimeout(() => setToast(""), 2500); }} />
        )}
```
(`toast`/`setToast` exist from Task 4.)

- [ ] **Step 3: End-to-end check on the dev server**

`npm run dev`, phone or browser at mobile width: HUB → "Save as meal" → untick one → name "Test" → Save → toast → `/log/meal` shows "Test · 3 foods · … kcal" under Your meals → tap → change a grams value → Log all → HUB toast "Logged 3 foods ✓" and three new rows under Today (realtime). Then open the pattern again → Delete meal → confirm → gone from Your meals. Compare both screens against the B renders; fix drift.

- [ ] **Step 4: Typecheck, build, commit, push**

```bash
npx tsc --noEmit && npx vitest run && npm run build
git add components/SavePatternSheet.tsx "app/(tabs)/page.tsx"
git commit -m "feat(patterns): Save as meal sheet on the HUB"
git push origin HEAD
```

---

### Task 6: Ledger + handoff note

**Files:**
- Modify: `AGENTS.md` (append under the sub-project ledger / known deferred items)

- [ ] **Step 1: Append**

```md
## Sub-project 4a — Meal patterns (2026-09-01)
Saved meals: HUB "Save as meal" sheet → `meal_patterns` (jsonb items, direct writes) → `/log/meal` "Your meals" → `/log/meal/pattern/[id]` review (edit grams, ✕ per row, Log all = N `logMeal` inserts via the queue, Delete meal). Pure logic + tests in `lib/patterns.ts`. Deferred: swaps, fits-your-macros, seeding from Daily notes, building a pattern from search, editing a saved pattern.
SQL to paste once: the `meal_patterns` block at the end of `supabase/schema.sql`.
```

- [ ] **Step 2: Commit, push**

```bash
git add AGENTS.md
git commit -m "docs: sub-project 4a ledger entry"
git push origin HEAD
```

---

## Self-review notes

- Spec coverage: data model (T1), pure logic + reference numbers (T1), db (T2), review page incl. missing-id state, ✕ per row, Log all ordering, Delete confirm (T3), Your meals section + hidden at ≥2 chars (T4), HUB save sheet incl. offline message and ≥1 meal gating (T5), toast on log (T4), ledger (T6). Realtime refresh of the Today list is existing behaviour (`postgres_changes` on `meals`).
- Types: `PatternRow`, `PatternItem`, `MealLike` defined in T1 and used unchanged in T2–T5; `MealEntry` from `lib/log.ts` has `fdc_id?: string`, so `scaleItem` only sets it when present.
- Not covered on purpose: rename/edit pattern (spec: out of scope).
