# Meal Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a saved meal from scratch — name it, add foods through the existing search and/or manual macro lines — and log it later like any saved meal.

**Architecture:** No new table; `PatternItem` gains an optional `manual` flag and manual lines are stored as `grams = servings`, `per100g = macros × 100` so the existing `scaleItem` math is untouched. The search + amount flow moves out of the log-meal page into a reusable `FoodPicker` component (mechanical move, no logic change) that both the log page and the new builder page render. The builder is a new route `/log/meal/new`; the review page learns to show a servings field for manual lines.

**Tech Stack:** Next.js 16 app router (client components), Supabase JS, Tailwind tokens from `app/globals.css`, vitest.

**Spec:** `docs/superpowers/specs/2026-09-08-meal-builder-design.md`

**Design reference (implement FROM this, do not re-derive):** `docs/superpowers/design/2026-09-08-builder-12ui-C.png` and its converted HTML `docs/superpowers/design/2026-09-08-builder-html/derived.fixed.html`. The macro sheet reuses the shell of `components/SavePatternSheet.tsx`; the picker is the existing log-meal UI.

## Global Constraints

- Colours only via tokens (`bg-background`, `bg-surface`, `bg-surface-2`, `border-border`, `text-foreground`, `text-muted`, `text-accent`, `bg-accent`, `text-accent-foreground`, `text-success`, `text-danger`, `card-grad`; `bg-black/60` overlay is existing house style). Never a hex value in a component.
- No jargon in user-facing text.
- Numbers: kcal integers in display; macros 0.1 g in storage (`scaleItem`), integers in display (`totals`).
- Every write to `meals` goes through `logMeal`. Pattern writes are direct Supabase via `lib/patterns-db.ts`.
- Before every commit: `npx tsc --noEmit && npx vitest run && npm run build`. If tsc complains about `.next/types` duplicates (files like `routes.d 2.ts`), run `rm -rf .next && npx next typegen` first. New routes need `npx next typegen` before tsc.
- Work in `~/code/gainz-app` on `main`; push after each task (`git push origin HEAD`). No worktrees.
- Commit trailer on every commit:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01X86t9t18dGuSS7AAHC7wGd
  ```

---

## File structure

| File | Responsibility |
|---|---|
| `lib/patterns.ts` | + `manual?: true` on `PatternItem`, `manualItem()`, `unitOf()` |
| `lib/patterns.test.ts` | + tests for the two functions and manual scaling |
| `components/FoodPicker.tsx` | the search → amount → confirm flow, extracted from the log page |
| `app/log/meal/page.tsx` | thin: `<FoodPicker>` with the "Your meals" header slot (+ "New meal" action) |
| `components/MacroSheet.tsx` | bottom sheet: label + kcal/P/C/F → one manual line |
| `app/log/meal/new/page.tsx` | the builder |
| `app/log/meal/pattern/[id]/page.tsx` | servings input for manual lines |
| `AGENTS.md` | ledger entry |

---

### Task 1: Manual items in `lib/patterns.ts`

**Files:**
- Modify: `lib/patterns.ts`
- Test: `lib/patterns.test.ts` (append)

**Interfaces — Produces:**
```ts
export type PatternItem = { food_name: string; grams: number; per100g: Per100; fdc_id: string | null; manual?: true };
export function manualItem(label: string, macros: { kcal: number; protein: number; carbs: number; fat: number }): PatternItem;
export function unitOf(item: Pick<PatternItem, "manual">): "g" | "serving";
```

- [ ] **Step 1: Append failing tests to `lib/patterns.test.ts`**

```ts
import { manualItem, unitOf } from "./patterns";   // merge into the existing import line

describe("manual items", () => {
  const shake = manualItem("  Chipotle bowl ", { kcal: 900, protein: 55, carbs: 90, fat: 35 });
  it("stores 1 serving with per-100-servings macros and a manual flag", () => {
    expect(shake).toEqual({ food_name: "Chipotle bowl", grams: 1, fdc_id: null, manual: true,
      per100g: { kcal: 90000, protein: 5500, carbs: 9000, fat: 3500 } });
  });
  it("scales exactly: 1 serving = typed macros, 1.5 servings = ×1.5", () => {
    expect(scaleItem(shake, 1)).toEqual({ food_name: "Chipotle bowl", grams: 1, calories: 900, protein_g: 55, carbs_g: 90, fat_g: 35 });
    expect(scaleItem(shake, 1.5)).toEqual({ food_name: "Chipotle bowl", grams: 1.5, calories: 1350, protein_g: 82.5, carbs_g: 135, fat_g: 52.5 });
  });
  it("unitOf: manual → serving, food → g", () => {
    expect(unitOf(shake)).toBe("serving");
    expect(unitOf({ manual: undefined })).toBe("g");
    expect(unitOf(yogurt)).toBe("g");
  });
});
```

- [ ] **Step 2: Run to see failure** — `npx vitest run lib/patterns.test.ts` → FAIL: `manualItem` is not exported.

- [ ] **Step 3: Implement**

In `lib/patterns.ts` change the type and add the functions:

```ts
export type PatternItem = { food_name: string; grams: number; per100g: Per100; fdc_id: string | null;
  manual?: true };   // manual: grams = servings, per100g = macros × 100 (so scaleItem needs no special case)

/** A line typed by hand: "1 serving" of exactly these macros. */
export function manualItem(label: string, m: { kcal: number; protein: number; carbs: number; fat: number }): PatternItem {
  return { food_name: label.trim(), grams: 1, fdc_id: null, manual: true,
    per100g: { kcal: m.kcal * 100, protein: m.protein * 100, carbs: m.carbs * 100, fat: m.fat * 100 } };
}

export function unitOf(item: Pick<PatternItem, "manual">): "g" | "serving" {
  return item.manual ? "serving" : "g";
}
```

- [ ] **Step 4: Run tests** — `npx vitest run lib/patterns.test.ts` → all pass (11).

- [ ] **Step 5: Full checks, commit, push**

```bash
npx tsc --noEmit && npx vitest run
git add lib/patterns.ts lib/patterns.test.ts
git commit -m "feat(patterns): manual macro lines — manualItem, unitOf"
git push origin HEAD
```

---

### Task 2: Extract `components/FoodPicker.tsx` from the log-meal page

**Files:**
- Create: `components/FoodPicker.tsx`
- Modify: `app/log/meal/page.tsx` (becomes a thin wrapper)

**Interfaces — Produces:**
```ts
export type PickedEntry = MealEntry;   // from lib/log.ts
export default function FoodPicker(props: {
  onPick: (entry: MealEntry) => Promise<void> | void;   // called on confirm; may throw → picker shows "Couldn't save. Please try again."
  confirmLabel: string;                                   // "Save" | "Add to meal"
  successLabel?: string;                                  // shown for 2 s after a successful pick when provided ("Logged ✓"); omit for none
  header?: React.ReactNode;                               // rendered above the search box while searching (not on the amount screen)
}): JSX.Element;
```

This is a **mechanical move**: every type, constant, state hook, effect, helper and both JSX branches from `app/log/meal/page.tsx` move into `FoodPicker` unchanged, except the four points below. Do not restyle, rename or "improve" anything else.

- [ ] **Step 1: Create `components/FoodPicker.tsx`**

Start the file with `"use client";` and the current imports of the page minus `AuthGuard`, `Link`, `listPatterns`, `scaleItem/sortPatterns/totals/PatternRow` (those belong to the page). Move lines from `type Per100` through the `macroLine` helper verbatim (types, `BASE_UNITS`, all `useState`/`useRef`/`useEffect`, `loadPortions`, `toPicked`, `pickItem`, `swapTo`, `pickHistory`, `showSwitch`, `n/grams/scale`, `Badge`, `Row`, `macroLine`). Remove the `patterns` state and its `listPatterns` effect (they move to the page).

The four changes:

1. Signature: `export default function FoodPicker({ onPick, confirmLabel, successLabel, header }: { … })`.
2. `save()` becomes:
```tsx
  async function save() {
    if (!picked || grams <= 0) return;
    setErr("");
    try {
      await onPick({
        food_name: picked.name, grams,
        calories: scale(picked.per100g.kcal), protein_g: scale(picked.per100g.protein),
        carbs_g: scale(picked.per100g.carbs), fat_g: scale(picked.per100g.fat),
        fdc_id: picked.fdcId ? String(picked.fdcId) : undefined,
      });
      setPicked(null); setQ(""); setAmount("");
      if (successLabel) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    } catch {
      setErr("Couldn't save. Please try again.");
    }
  }
```
3. The returned JSX drops `<AuthGuard>`, `<main>` and the `<h1>Log meal</h1>`; it returns a fragment containing: the `saved` banner (text = `successLabel`), then the same `{picked ? (amount screen) : (search)}` ternary. The Save button's text becomes `{confirmLabel}`. Inside the search branch, replace the whole "Your meals" `<section>` with `{header}` rendered directly after the search `<input>`.
4. The amount screen's "Back" button stays (it returns to search); nothing else changes.

- [ ] **Step 2: Rewrite `app/log/meal/page.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import FoodPicker from "@/components/FoodPicker";
import { logMeal } from "@/lib/log";
import { listPatterns } from "@/lib/patterns-db";
import { scaleItem, sortPatterns, totals, type PatternRow } from "@/lib/patterns";

export default function LogMeal() {
  const [patterns, setPatterns] = useState<PatternRow[]>([]);
  useEffect(() => { listPatterns().then((p) => setPatterns(sortPatterns(p))).catch(() => setPatterns([])); }, []);

  const yourMeals = (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">Your meals</h2>
        <Link href="/log/meal/new" className="text-[12px] font-semibold text-accent active:opacity-80">New meal</Link>
      </div>
      {patterns.length > 0 && (
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
                      {p.items.length} food{p.items.length === 1 ? "" : "s"} · {t.kcal} kcal · {t.protein_g} P
                    </span>
                  </span>
                  <span className="text-muted">›</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background px-4 pb-10 pt-6 text-foreground">
        <h1 className="text-xl font-bold tracking-tight">Log meal</h1>
        <FoodPicker confirmLabel="Save" successLabel="Logged ✓" onPick={logMeal} header={yourMeals} />
      </main>
    </AuthGuard>
  );
}
```

Note the one intentional behaviour change from the spec: the "Your meals" header (with the New meal link) now renders even with zero patterns; the list itself is still hidden when empty. The header slot is only shown while the query is < 2 chars — keep that condition inside `FoodPicker` where the old section lived: `{q.trim().length < 2 && header}`.

- [ ] **Step 3: Verify nothing changed visibly**

`npx tsc --noEmit && npm run build`. Then `npm run dev` and open `/log/meal`: search "chicken", tap Chicken breast, toggle Raw/Cooked, switch a unit chip, type grams, Back — every interaction identical to before. If you cannot sign in headlessly, say so in the report; tsc + build + a careful diff review (the move should show as pure relocation) are the evidence.

- [ ] **Step 4: Commit, push**

```bash
npx tsc --noEmit && npx vitest run && npm run build
git add components/FoodPicker.tsx app/log/meal/page.tsx
git commit -m "refactor(meal): extract FoodPicker from the log page; Your meals header with New meal link"
git push origin HEAD
```

---

### Task 3: `components/MacroSheet.tsx` + builder page `/log/meal/new`

**Files:**
- Create: `components/MacroSheet.tsx`
- Create: `app/log/meal/new/page.tsx`

**Interfaces — Consumes:** `FoodPicker` (Task 2), `manualItem`, `itemsFromMeals`, `scaleItem`, `totals`, `unitOf`, `PatternItem` (Task 1 / 4a), `createPattern` (4a). **Design:** builder from `2026-09-08-builder-12ui-C.png` + its HTML (read both first): back arrow + inline "New meal" title; name field with a bowl glyph at left (use a simple inline SVG or the 🥣-free text approach: a muted "◯" is NOT acceptable — use an inline SVG bowl like the HUB's next-meal icon in `app/(tabs)/page.tsx`); lines card (name; `200 g · 302 kcal · 61 P` muted; ✕); two outlined accent buttons "Add food" / "Add macros" side by side; totals strip; full-width accent "Save meal".

- [ ] **Step 1: Create `components/MacroSheet.tsx`**

Same shell as `SavePatternSheet` (overlay, `role="dialog"`, Escape closes, grab handle):

```tsx
"use client";
import { useEffect, useState } from "react";
import { manualItem, type PatternItem } from "@/lib/patterns";

export default function MacroSheet({ onAdd, onClose }: { onAdd: (item: PatternItem) => void; onClose: () => void }) {
  const [label, setLabel] = useState("");
  const [v, setV] = useState({ kcal: "", protein: "", carbs: "", fat: "" });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const num = (s: string) => Math.max(0, parseFloat(s) || 0);
  const canAdd = label.trim().length > 0 && num(v.kcal) > 0;
  const field = (key: keyof typeof v, name: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted">{name}</span>
      <input inputMode="decimal" placeholder="0" value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })}
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-lg font-bold tabular-nums text-foreground placeholder:text-muted focus:border-accent focus:outline-none" />
    </label>
  );
  return (
    <>
      <div className="fixed inset-0 z-10 bg-black/60" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="macro-sheet-title"
        className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md rounded-t-3xl border-t border-border bg-surface px-4 pb-6 pt-3 shadow-2xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
        <h2 id="macro-sheet-title" className="text-2xl font-bold">Add macros</h2>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Protein shake" autoFocus
          className="mt-3 w-full rounded-2xl border border-border bg-background px-4 py-3.5 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none" />
        <div className="mt-3 grid grid-cols-4 gap-2">
          {field("kcal", "kcal")}{field("protein", "P")}{field("carbs", "C")}{field("fat", "F")}
        </div>
        <p className="mt-2 text-[12px] text-muted">One serving. You can log 1.5 or 2 servings later.</p>
        <button type="button" disabled={!canAdd}
          onClick={() => onAdd(manualItem(label, { kcal: num(v.kcal), protein: num(v.protein), carbs: num(v.carbs), fat: num(v.fat) }))}
          className="mt-4 w-full rounded-2xl bg-accent px-4 py-4 text-lg font-semibold text-accent-foreground active:opacity-80 disabled:opacity-40">
          Add
        </button>
        <button type="button" onClick={onClose} className="mt-2 w-full py-2 text-sm text-accent">Cancel</button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Create `app/log/meal/new/page.tsx`**

```tsx
"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import FoodPicker from "@/components/FoodPicker";
import MacroSheet from "@/components/MacroSheet";
import { createPattern } from "@/lib/patterns-db";
import { itemsFromMeals, scaleItem, totals, unitOf, type PatternItem } from "@/lib/patterns";
import type { MealEntry } from "@/lib/log";

type Line = { key: number; item: PatternItem };

export default function NewMeal() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [mode, setMode] = useState<"list" | "food" | "macros">("list");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const nextKey = useMemo(() => (lines.length ? Math.max(...lines.map((l) => l.key)) + 1 : 0), [lines]);

  const entries = lines.map((l) => scaleItem(l.item, l.item.grams));
  const sum = totals(entries);
  const canSave = name.trim().length > 0 && lines.length > 0 && !busy;

  function addFood(entry: MealEntry) {
    const [item] = itemsFromMeals([entry]);
    if (item) setLines((ls) => [...ls, { key: nextKey, item }]);
    setMode("list");
  }
  function addMacros(item: PatternItem) {
    setLines((ls) => [...ls, { key: nextKey, item }]);
    setMode("list");
  }

  async function save() {
    if (!canSave) return;
    setBusy(true); setErr("");
    try {
      await createPattern(name, lines.map((l) => l.item));
      router.replace("/log/meal");
    } catch { setErr("Couldn't save. Try again."); setBusy(false); }
  }

  const lineSub = (l: Line, e: MealEntry) =>
    `${unitOf(l.item) === "g" ? `${l.item.grams} g` : `${l.item.grams} serving${l.item.grams === 1 ? "" : "s"}`} · ${Math.round(e.calories)} kcal · ${Math.round(e.protein_g)} P`;

  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background px-4 pb-10 pt-6 text-foreground">
        <div className="flex items-center gap-3">
          {mode === "list" ? (
            <Link href="/log/meal" aria-label="Back" className="text-2xl text-accent">←</Link>
          ) : (
            <button type="button" aria-label="Cancel" onClick={() => setMode("list")} className="text-2xl text-accent">←</button>
          )}
          <h1 className="text-2xl font-bold leading-tight">{mode === "food" ? "Add food" : "New meal"}</h1>
        </div>

        {mode === "food" && <FoodPicker confirmLabel="Add to meal" onPick={addFood} />}

        {mode !== "food" && (
          <>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Chipotle bowl"
              className="w-full rounded-2xl border border-border bg-surface px-4 py-3.5 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none" />

            <ul className="card-grad divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {lines.map((l, i) => (
                <li key={l.key} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-foreground">{l.item.food_name}</span>
                    <span className="mt-0.5 block text-[12px] tabular-nums text-muted">{lineSub(l, entries[i])}</span>
                  </span>
                  <button type="button" aria-label={`Remove ${l.item.food_name}`}
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    className="flex h-10 w-10 shrink-0 items-center justify-center text-lg text-accent/80 active:text-accent">×</button>
                </li>
              ))}
              {lines.length === 0 && <li className="px-4 py-3 text-sm text-muted">Nothing added yet.</li>}
            </ul>

            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setMode("food")}
                className="rounded-2xl border border-accent px-4 py-3.5 text-base font-semibold text-accent active:bg-accent/10">+ Add food</button>
              <button type="button" onClick={() => setMode("macros")}
                className="rounded-2xl border border-accent px-4 py-3.5 text-base font-semibold text-accent active:bg-accent/10">Add macros</button>
            </div>

            <div className="card-grad flex items-center justify-around rounded-2xl border border-border px-4 py-3.5 text-center">
              {([["kcal", sum.kcal], ["P", sum.protein_g], ["C", sum.carbs_g], ["F", sum.fat_g]] as const).map(([l, v]) => (
                <span key={l}>
                  <span className="block text-2xl font-bold tabular-nums text-accent">{v}</span>
                  <span className="text-[12px] text-muted">{l}</span>
                </span>
              ))}
            </div>

            {err && <p className="text-sm text-danger">{err}</p>}
            <button type="button" onClick={save} disabled={!canSave}
              className="w-full rounded-2xl bg-accent px-4 py-4 text-lg font-semibold text-accent-foreground active:opacity-80 disabled:opacity-40">
              {busy ? "Saving…" : "Save meal"}
            </button>
          </>
        )}

        {mode === "macros" && <MacroSheet onAdd={addMacros} onClose={() => setMode("list")} />}
      </main>
    </AuthGuard>
  );
}
```

Match the render for spacing, the bowl glyph in the name field, and the outlined buttons' icons (an inline SVG "+" circle and a small bars icon are fine; text-only is acceptable if the icons fight the layout — say which in the report).

- [ ] **Step 3: Verify**

`rm -rf .next && npx next typegen && npx tsc --noEmit && npx vitest run && npm run build` (route `/log/meal/new` listed). Dev-server check if you can sign in: New meal → Add food → pick something → back on the list with the line → Add macros → Add → totals update → Save → lands on Log meal with the new row under Your meals.

- [ ] **Step 4: Commit, push**

```bash
git add components/MacroSheet.tsx app/log/meal/new
git commit -m "feat(meal-builder): New meal page — add foods via FoodPicker, add manual macro lines, save as pattern"
git push origin HEAD
```

---

### Task 4: Servings on the review page

**Files:**
- Modify: `app/log/meal/pattern/[id]/page.tsx`

- [ ] **Step 1: Use `unitOf` per row**

Import `unitOf` from `@/lib/patterns`. In the row JSX where the grams input renders `<span className="text-sm text-muted">g</span>`, replace with:

```tsx
<span className="text-sm text-muted">{unitOf(pattern.items[row.key]) === "g" ? "g" : "srv"}</span>
```

and give the input `step={unitOf(pattern.items[row.key]) === "g" ? 1 : 0.5}` and `aria-label={`${row.food_name} ${unitOf(pattern.items[row.key]) === "g" ? "grams" : "servings"}`}`. Everything else (pre-fill from `it.grams`, scaling, Log all) is unchanged because `scaleItem` handles both.

- [ ] **Step 2: Verify, commit, push**

```bash
npx tsc --noEmit && npx vitest run && npm run build
git add "app/log/meal/pattern"
git commit -m "feat(patterns): review page shows servings for manual lines"
git push origin HEAD
```

---

### Task 5: Ledger

**Files:** Modify `AGENTS.md` — append under the sub-project 4a section:

```md
### 4b — Meal builder (2026-09-08)
`/log/meal/new`: name + lines from `FoodPicker` (search extracted from the log page into `components/FoodPicker.tsx`) and/or `MacroSheet` manual lines (`manualItem`: grams = servings, per100g = macros × 100, `manual: true`); saves via `createPattern`. Review page shows "srv" for manual lines. Deferred: editing saved meals, reordering, drafts.
```

Commit `docs: sub-project 4b ledger entry`, push.

---

## Self-review notes

- Spec coverage: data model (T1), pure logic + reference cases (T1), FoodPicker extraction with header slot (T2), New meal link even with zero patterns (T2), builder incl. both add paths, totals, save, error, cancel (T3), review page servings (T4), ledger (T5). Offline copy for Save on the builder: not added — the builder's save error message covers it ("Couldn't save. Try again."); ruled acceptable, note in ledger if the reviewer objects.
- Types: `PatternItem.manual` optional so 4a rows and `itemsFromMeals` output are unchanged; `unitOf` takes `Pick<PatternItem,"manual">` so any item shape works.
- `nextKey` via `useMemo` is derived from `lines`, so two rapid adds get distinct keys because each add reads the latest `lines` through the functional updater — actually `nextKey` is captured at render; adds happen one per user action with a re-render between, so it is fine.
