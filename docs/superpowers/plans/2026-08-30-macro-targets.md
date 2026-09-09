# Macro Targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard's hardcoded `TARGETS` constant with per-user macro targets computed from a Supabase `profiles` row via a pure, unit-tested function.

**Architecture:** A pure TypeScript module (`lib/targets.ts`) turns a profile into kcal/P/C/F using Mifflin-St Jeor + George's fat/protein formula. A `profiles` table (one row per auth user, RLS) stores inputs. A `/profile` page edits the row with a live preview; the dashboard reads the row and calls the function.

**Tech Stack:** Next.js 16 App Router (client components), TypeScript strict, Tailwind v4, Supabase JS v2, vitest (new).

**Spec:** `docs/superpowers/specs/2026-08-30-macro-targets-design.md`

## Global Constraints

- Next.js in this repo is **16.x** — APIs differ from training data. Consult `node_modules/next/dist/docs/01-app/` before using any Next API not already used in the repo. Every page here is `"use client"` and uses only `next/link`, `next/navigation`, React hooks — nothing new.
- Repo path alias: `@/*` → repo root (`@/lib/supabase`, `@/components/AuthGuard`).
- Test files import siblings relatively (`./targets`), not via `@/` — vitest is not configured for tsconfig paths and `lib/targets.ts` has no imports.
- Rounding rule (spec): round `kcal`, `fat_g`, `protein_g` to integers first, then compute `carbs_g` from rounded values.
- Formula constants: fat `0.33` g/lb; protein default cut `1.1`, maintain `1.0`, bulk `1.0`; rate default cut `1.5`, maintain `0`, bulk `0.5`; `delta_kcal = rate × 3500 / 7`; activity multipliers sedentary 1.2, light 1.375, moderate 1.55, active 1.725, very 1.9.
- Warning string exactly: `"kcal too low for fat + protein floors"`.
- UI styling follows existing pages: dark theme tokens `bg-background`, `bg-surface`, `bg-surface-2`, `border-border`, `text-foreground`, `text-muted`, `bg-accent`, `text-accent-foreground`, `text-danger`, `text-success`; `rounded-xl`/`rounded-2xl`; inputs `px-4 py-3.5 text-base`.
- Secrets: nothing new. Profile writes use the anon key + RLS like meals/lifts.
- Commit after every task. Commit messages: conventional prefix (`feat:`, `test:`, `chore:`, `docs:`), imperative, plus trailer lines:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01WraoijQSNZAjFvB34uVZh6
  ```

## File Structure

| File | Responsibility |
|---|---|
| `lib/targets.ts` (create) | Pure math: types, constants, `ageOn`, `estimateTdee`, `computeTargets`, `defaultProteinPerLb`, `defaultRate`. No I/O, no React. |
| `lib/targets.test.ts` (create) | vitest unit tests for everything in `lib/targets.ts`. |
| `lib/profile.ts` (create) | Supabase I/O for the `profiles` row: `getProfile`, `upsertProfile`. |
| `supabase/schema.sql` (modify) | Append `profiles` table + RLS policy. |
| `app/profile/page.tsx` (create) | Edit form + live target preview. |
| `app/page.tsx` (modify) | Drop `TARGETS`; fetch profile; render targets or setup prompt; header link to `/profile`. |
| `package.json` (modify) | Add `vitest` devDependency and `"test": "vitest run"` script. |
| `AGENTS.md` (modify) | Document new files and the `profiles` table. |

---

### Task 1: vitest + phase defaults

**Files:**
- Modify: `package.json`
- Create: `lib/targets.ts`
- Create: `lib/targets.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Phase = "cut" | "maintain" | "bulk";
  export function defaultProteinPerLb(phase: Phase): number; // 1.1 cut, 1.0 otherwise
  export function defaultRate(phase: Phase): number;         // 1.5 cut, 0 maintain, 0.5 bulk
  ```

- [ ] **Step 1: Install vitest and add the test script**

Run: `cd ~/Documents/Gainz-App && npm install -D vitest`

Then edit `package.json` scripts to:
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "test": "vitest run"
}
```

- [ ] **Step 2: Write the failing test**

Create `lib/targets.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { defaultProteinPerLb, defaultRate } from "./targets";

describe("phase defaults", () => {
  it("protein: cut 1.1, maintain 1.0, bulk 1.0", () => {
    expect(defaultProteinPerLb("cut")).toBe(1.1);
    expect(defaultProteinPerLb("maintain")).toBe(1.0);
    expect(defaultProteinPerLb("bulk")).toBe(1.0);
  });

  it("rate: cut 1.5, maintain 0, bulk 0.5", () => {
    expect(defaultRate("cut")).toBe(1.5);
    expect(defaultRate("maintain")).toBe(0);
    expect(defaultRate("bulk")).toBe(0.5);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./targets"` (file does not exist).

- [ ] **Step 4: Write minimal implementation**

Create `lib/targets.ts`:
```ts
export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "very";
export type Phase = "cut" | "maintain" | "bulk";

export function defaultProteinPerLb(phase: Phase): number {
  return phase === "cut" ? 1.1 : 1.0;
}

export function defaultRate(phase: Phase): number {
  if (phase === "cut") return 1.5;
  if (phase === "bulk") return 0.5;
  return 0;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: `2 passed`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/targets.ts lib/targets.test.ts
git commit -m "test: add vitest; feat: phase defaults for protein and cut rate"
```
(Include the trailer lines from Global Constraints.)

---

### Task 2: age + Mifflin-St Jeor TDEE estimate

**Files:**
- Modify: `lib/targets.ts`
- Modify: `lib/targets.test.ts`

**Interfaces:**
- Consumes: `Sex`, `Activity` from Task 1.
- Produces:
  ```ts
  export const ACTIVITY_MULTIPLIER: Record<Activity, number>;
  export function ageOn(birth_date: string /* YYYY-MM-DD */, today: Date): number;
  export function estimateTdee(
    p: { sex: Sex; birth_date: string; height_in: number; weight_lb: number; activity: Activity },
    today: Date
  ): number; // rounded kcal
  ```

- [ ] **Step 1: Write the failing tests**

Append to `lib/targets.test.ts` (add `ageOn, estimateTdee` to the import):
```ts
describe("ageOn", () => {
  const today = new Date(2026, 7, 30); // 2026-08-30 local
  it("counts full years when birthday already passed this year", () => {
    expect(ageOn("2007-06-01", today)).toBe(19);
  });
  it("does not count the year when birthday has not passed yet", () => {
    expect(ageOn("2007-09-15", today)).toBe(18);
  });
  it("counts the birthday itself", () => {
    expect(ageOn("2007-08-30", today)).toBe(19);
  });
});

describe("estimateTdee (Mifflin-St Jeor × activity)", () => {
  const today = new Date(2026, 7, 30);
  it("male 170 lb, 70 in, age 19, moderate → 3109", () => {
    expect(estimateTdee({ sex: "male", birth_date: "2007-06-01", height_in: 70,
      weight_lb: 170, activity: "moderate" }, today)).toBe(3109);
  });
  it("female 150 lb, 65 in, age 30, light → 1927", () => {
    expect(estimateTdee({ sex: "female", birth_date: "1996-01-10", height_in: 65,
      weight_lb: 150, activity: "light" }, today)).toBe(1927);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `ageOn is not a function` / `estimateTdee is not a function` (export missing).

- [ ] **Step 3: Implement**

Append to `lib/targets.ts`:
```ts
export const ACTIVITY_MULTIPLIER: Record<Activity, number> = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very: 1.9,
};

const LB_TO_KG = 0.45359237;
const IN_TO_CM = 2.54;

/** Whole years between a YYYY-MM-DD birth date and `today` (local calendar). */
export function ageOn(birth_date: string, today: Date): number {
  const [y, m, d] = birth_date.split("-").map(Number);
  let age = today.getFullYear() - y;
  const month = today.getMonth() + 1;
  const beforeBirthday = month < m || (month === m && today.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

/** Mifflin-St Jeor BMR × activity multiplier, rounded to whole kcal. */
export function estimateTdee(
  p: { sex: Sex; birth_date: string; height_in: number; weight_lb: number; activity: Activity },
  today: Date
): number {
  const kg = p.weight_lb * LB_TO_KG;
  const cm = p.height_in * IN_TO_CM;
  const age = ageOn(p.birth_date, today);
  const bmr = 10 * kg + 6.25 * cm - 5 * age + (p.sex === "male" ? 5 : -161);
  return Math.round(bmr * ACTIVITY_MULTIPLIER[p.activity]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/targets.ts lib/targets.test.ts
git commit -m "feat: age and Mifflin-St Jeor TDEE estimate"
```

---

### Task 3: computeTargets

**Files:**
- Modify: `lib/targets.ts`
- Modify: `lib/targets.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–2.
- Produces:
  ```ts
  export type Profile = {
    sex: Sex; birth_date: string; height_in: number; weight_lb: number;
    activity: Activity; phase: Phase; rate_lb_per_wk: number;
    protein_g_per_lb: number | null; tdee_override: number | null;
  };
  export type Targets = {
    kcal: number; protein_g: number; carbs_g: number; fat_g: number;
    tdee: number; tdee_est: number; warning?: string;
  };
  export const FAT_G_PER_LB = 0.33;
  export function computeTargets(p: Profile, today?: Date): Targets;
  ```

- [ ] **Step 1: Write the failing tests**

Append to `lib/targets.test.ts` (add `computeTargets` and `type Profile` to the import):
```ts
describe("computeTargets", () => {
  const today = new Date(2026, 7, 30);
  const george: Profile = {
    sex: "male", birth_date: "2007-06-01", height_in: 70, weight_lb: 170,
    activity: "moderate", phase: "cut", rate_lb_per_wk: 1.5,
    protein_g_per_lb: 1.1, tdee_override: 3100,
  };

  it("reference: George cutting → 2350 / 223P / 214C / 67F", () => {
    const t = computeTargets(george, today);
    expect(t).toMatchObject({ kcal: 2350, protein_g: 223, carbs_g: 214, fat_g: 67,
      tdee: 3100, tdee_est: 3109 });
    expect(t.warning).toBeUndefined();
  });

  it("uses the estimate when override is null", () => {
    const t = computeTargets({ ...george, tdee_override: null }, today);
    expect(t.tdee).toBe(3109);
    expect(t.kcal).toBe(2359);
  });

  it("uses the phase default protein when protein_g_per_lb is null", () => {
    expect(computeTargets({ ...george, protein_g_per_lb: null }, today).protein_g).toBe(223); // 1.1 × 200
    expect(computeTargets({ ...george, protein_g_per_lb: null, phase: "maintain" }, today).protein_g).toBe(200); // 1.0 × 200
  });

  it("maintain ignores rate", () => {
    const t = computeTargets({ ...george, phase: "maintain", rate_lb_per_wk: 1.5 }, today);
    expect(t.kcal).toBe(3100);
  });

  it("bulk adds the surplus", () => {
    const t = computeTargets({ ...george, phase: "bulk", rate_lb_per_wk: 0.5, tdee_override: 3000 }, today);
    expect(t.kcal).toBe(3250);
  });

  it("floors carbs at 0 and warns when kcal cannot fit fat + protein", () => {
    const t = computeTargets({ ...george, tdee_override: 1400 }, today); // 650 kcal
    expect(t.kcal).toBe(650);
    expect(t.carbs_g).toBe(0);
    expect(t.warning).toBe("kcal too low for fat + protein floors");
  });

  it("defaults today to now (smoke)", () => {
    expect(computeTargets(george).kcal).toBe(2350);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `computeTargets is not a function`.

- [ ] **Step 3: Implement**

Append to `lib/targets.ts`:
```ts
export type Profile = {
  sex: Sex;
  birth_date: string; // YYYY-MM-DD
  height_in: number;
  weight_lb: number;
  activity: Activity;
  phase: Phase;
  rate_lb_per_wk: number;
  protein_g_per_lb: number | null;
  tdee_override: number | null;
};

export type Targets = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  tdee: number;
  tdee_est: number;
  warning?: string;
};

export const FAT_G_PER_LB = 0.33;
const KCAL_PER_LB_FAT = 3500;

export function computeTargets(p: Profile, today: Date = new Date()): Targets {
  const tdee_est = estimateTdee(p, today);
  const tdee = p.tdee_override ?? tdee_est;
  const delta = (p.rate_lb_per_wk * KCAL_PER_LB_FAT) / 7;
  const rawKcal = p.phase === "cut" ? tdee - delta : p.phase === "bulk" ? tdee + delta : tdee;

  const kcal = Math.round(rawKcal);
  const fat_g = Math.round(FAT_G_PER_LB * p.weight_lb);
  const protein_g = Math.round((p.protein_g_per_lb ?? defaultProteinPerLb(p.phase)) * p.weight_lb);
  const remaining = kcal - 9 * fat_g - 4 * protein_g;
  const carbs_g = Math.max(0, Math.round(remaining / 4));

  const t: Targets = { kcal, protein_g, carbs_g, fat_g, tdee, tdee_est };
  if (remaining < 0) t.warning = "kcal too low for fat + protein floors";
  return t;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: `14 passed`.

- [ ] **Step 5: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add lib/targets.ts lib/targets.test.ts
git commit -m "feat: computeTargets — kcal and macros from profile"
```

---

### Task 4: profiles table + Supabase wrapper

**Files:**
- Modify: `supabase/schema.sql`
- Create: `lib/profile.ts`

**Interfaces:**
- Consumes: `Profile` type from Task 3.
- Produces:
  ```ts
  export type ProfileRow = Profile & { id: string; updated_at: string };
  export async function getProfile(): Promise<ProfileRow | null>;
  export async function upsertProfile(p: Profile): Promise<void>; // throws on error
  ```

- [ ] **Step 1: Append the table to `supabase/schema.sql`**

Append at the end of the file:
```sql
create table if not exists profiles (
  id uuid primary key references auth.users(id) default auth.uid(),
  sex text not null check (sex in ('male','female')),
  birth_date date not null,
  height_in numeric not null check (height_in > 0),
  weight_lb numeric not null check (weight_lb > 0),
  activity text not null check (activity in ('sedentary','light','moderate','active','very')),
  phase text not null check (phase in ('cut','maintain','bulk')),
  rate_lb_per_wk numeric not null default 0 check (rate_lb_per_wk >= 0),
  protein_g_per_lb numeric check (protein_g_per_lb between 0.8 and 1.5),
  tdee_override integer check (tdee_override > 0),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "own profile" on profiles for all
  using (id = auth.uid()) with check (id = auth.uid());
```

- [ ] **Step 2: Apply it to the live database**

Open Supabase dashboard → SQL Editor → paste **only the block from Step 1** (the meals/lifts policies above it already exist and `create policy` is not idempotent) → Run.
Expected: `Success. No rows returned`.

Verify: Table Editor shows `profiles` with RLS enabled (shield icon).

- [ ] **Step 3: Write `lib/profile.ts`**

```ts
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/targets";

export type ProfileRow = Profile & { id: string; updated_at: string };

export async function getProfile(): Promise<ProfileRow | null> {
  const { data, error } = await supabase.from("profiles").select("*").maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    height_in: Number(data.height_in),
    weight_lb: Number(data.weight_lb),
    rate_lb_per_wk: Number(data.rate_lb_per_wk),
    protein_g_per_lb: data.protein_g_per_lb === null ? null : Number(data.protein_g_per_lb),
    tdee_override: data.tdee_override === null ? null : Number(data.tdee_override),
  } as ProfileRow;
}

export async function upsertProfile(p: Profile): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, ...p, updated_at: new Date().toISOString() });
  if (error) throw error;
}
```
Why the `Number(...)` coercion: Postgres `numeric` columns come back from supabase-js as strings; `computeTargets` does arithmetic on them.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql lib/profile.ts
git commit -m "feat: profiles table with RLS and Supabase profile wrapper"
```

---

### Task 5: /profile page with live preview

**Files:**
- Create: `app/profile/page.tsx`

**Interfaces:**
- Consumes: `computeTargets`, `defaultProteinPerLb`, `defaultRate`, `Profile`, `Phase`, `Activity`, `Sex` from `@/lib/targets`; `getProfile`, `upsertProfile` from `@/lib/profile`; `AuthGuard` from `@/components/AuthGuard`.
- Produces: route `/profile`.

- [ ] **Step 1: Write the page**

Create `app/profile/page.tsx`:
```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import { getProfile, upsertProfile } from "@/lib/profile";
import {
  computeTargets, defaultProteinPerLb, defaultRate,
  type Activity, type Phase, type Profile, type Sex,
} from "@/lib/targets";

const ACTIVITIES: { value: Activity; label: string }[] = [
  { value: "sedentary", label: "Sedentary (desk, no training)" },
  { value: "light", label: "Light (1–3 sessions/wk)" },
  { value: "moderate", label: "Moderate (3–5 sessions/wk)" },
  { value: "active", label: "Active (6–7 sessions/wk)" },
  { value: "very", label: "Very active (2×/day or physical job)" },
];

const inputCls = "w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none";
const labelCls = "text-xs font-semibold text-muted";

// Form state is strings so the user can clear a field mid-edit without NaN fights.
type Form = {
  sex: Sex; birth_date: string; height_in: string; weight_lb: string;
  activity: Activity; phase: Phase; rate_lb_per_wk: string;
  protein_g_per_lb: string; tdee_override: string;
};

const EMPTY: Form = {
  sex: "male", birth_date: "", height_in: "", weight_lb: "",
  activity: "moderate", phase: "cut", rate_lb_per_wk: String(defaultRate("cut")),
  protein_g_per_lb: "", tdee_override: "",
};

function toProfile(f: Form): Profile | null {
  const height_in = parseFloat(f.height_in);
  const weight_lb = parseFloat(f.weight_lb);
  const rate = parseFloat(f.rate_lb_per_wk);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.birth_date)) return null;
  if (!(height_in > 0) || !(weight_lb > 0) || !(rate >= 0)) return null;
  const protein = f.protein_g_per_lb === "" ? null : parseFloat(f.protein_g_per_lb);
  if (protein !== null && !(protein >= 0.8 && protein <= 1.5)) return null;
  const tdee = f.tdee_override === "" ? null : parseInt(f.tdee_override, 10);
  if (tdee !== null && !(tdee > 0)) return null;
  return {
    sex: f.sex, birth_date: f.birth_date, height_in, weight_lb,
    activity: f.activity, phase: f.phase, rate_lb_per_wk: rate,
    protein_g_per_lb: protein, tdee_override: tdee,
  };
}

export default function ProfilePage() {
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    getProfile()
      .then((p) => {
        if (p) setForm({
          sex: p.sex, birth_date: p.birth_date, height_in: String(p.height_in),
          weight_lb: String(p.weight_lb), activity: p.activity, phase: p.phase,
          rate_lb_per_wk: String(p.rate_lb_per_wk),
          protein_g_per_lb: p.protein_g_per_lb === null ? "" : String(p.protein_g_per_lb),
          tdee_override: p.tdee_override === null ? "" : String(p.tdee_override),
        });
      })
      .catch(() => setErr("Couldn't load profile."))
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Changing phase resets rate to that phase's default and clears the protein override
  // so the phase default applies. User can re-edit afterwards.
  function changePhase(phase: Phase) {
    setForm((f) => ({ ...f, phase, rate_lb_per_wk: String(defaultRate(phase)), protein_g_per_lb: "" }));
  }

  const profile = useMemo(() => toProfile(form), [form]);
  const targets = useMemo(() => (profile ? computeTargets(profile) : null), [profile]);

  async function save() {
    if (!profile) return;
    setSaving(true); setErr("");
    try {
      await upsertProfile(profile);
      router.replace("/");
    } catch {
      setErr("Couldn't save. Please try again.");
      setSaving(false);
    }
  }

  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background px-4 pb-10 pt-6 text-foreground">
        <h1 className="text-xl font-bold tracking-tight">Profile &amp; targets</h1>
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Sex</span>
                <select className={inputCls} value={form.sex} onChange={(e) => set("sex")(e.target.value as Sex)}>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Birth date</span>
                <input className={inputCls} type="date" value={form.birth_date}
                  onChange={(e) => set("birth_date")(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Height (in)</span>
                <input className={inputCls} inputMode="decimal" placeholder="74" value={form.height_in}
                  onChange={(e) => set("height_in")(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Weight (lb)</span>
                <input className={inputCls} inputMode="decimal" placeholder="200" value={form.weight_lb}
                  onChange={(e) => set("weight_lb")(e.target.value)} />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className={labelCls}>Activity</span>
              <select className={inputCls} value={form.activity}
                onChange={(e) => set("activity")(e.target.value as Activity)}>
                {ACTIVITIES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </label>

            <div className="flex flex-col gap-1">
              <span className={labelCls}>Phase</span>
              <div className="grid grid-cols-3 gap-2">
                {(["cut", "maintain", "bulk"] as Phase[]).map((ph) => (
                  <button key={ph} type="button" onClick={() => changePhase(ph)}
                    className={`rounded-xl border px-3 py-3 text-sm font-semibold capitalize ${
                      form.phase === ph
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-surface text-foreground active:bg-surface-2"}`}>
                    {ph}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Rate (lb / week)</span>
                <input className={inputCls} inputMode="decimal" value={form.rate_lb_per_wk}
                  disabled={form.phase === "maintain"}
                  onChange={(e) => set("rate_lb_per_wk")(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Protein (g / lb)</span>
                <input className={inputCls} inputMode="decimal"
                  placeholder={`${defaultProteinPerLb(form.phase)} (default)`}
                  value={form.protein_g_per_lb}
                  onChange={(e) => set("protein_g_per_lb")(e.target.value)} />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className={labelCls}>TDEE override (kcal, optional)</span>
              <input className={inputCls} inputMode="numeric" placeholder="Leave blank to use estimate"
                value={form.tdee_override} onChange={(e) => set("tdee_override")(e.target.value)} />
            </label>

            <section className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold text-muted">Daily targets</h2>
              {targets ? (
                <>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {([["kcal", targets.kcal], ["P", targets.protein_g],
                       ["C", targets.carbs_g], ["F", targets.fat_g]] as const).map(([label, v]) => (
                      <div key={label}>
                        <p className="text-xl font-bold tabular-nums leading-none">{v}</p>
                        <p className="mt-1 text-[11px] text-muted">{label}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    TDEE est. {targets.tdee_est}
                    {profile?.tdee_override != null && ` · using override ${targets.tdee}`}
                  </p>
                  {targets.warning && <p className="mt-2 text-sm text-danger">{targets.warning}</p>}
                </>
              ) : (
                <p className="text-sm text-muted">Fill in every field to see targets.</p>
              )}
            </section>

            {err && <p className="text-sm text-danger">{err}</p>}
            <button
              className="rounded-xl bg-accent px-4 py-3.5 text-base font-semibold text-accent-foreground active:opacity-80 disabled:opacity-40"
              disabled={!profile || saving} onClick={save}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
```

- [ ] **Step 2: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc clean; build lists `/profile` in the route table with no errors.

- [ ] **Step 3: Manual check in the browser**

Run: `npm run dev`, open `http://localhost:3000/profile`, sign in if redirected.
- Enter: male, 2007-06-01 (or your real birth date), 74, 200, Moderate, Cut, rate 1.5, protein blank, override 3100.
- Expected preview: **2350 kcal · 223 P · 214 C · 67 F**, footer `TDEE est. 3109 · using override 3100`.
- Clear override → kcal becomes 2359, footer shows only `TDEE est. 3109`.
- Tap **Maintain** → rate field shows 0 and is disabled; kcal 3100 (with override restored) or 3109.
- Set override 1400 with Cut → red warning `kcal too low for fat + protein floors`, C shows 0.
- Save → lands on `/`. Refresh `/profile` → form re-populated from the DB.

- [ ] **Step 4: Commit**

```bash
git add app/profile/page.tsx
git commit -m "feat: profile page with live macro target preview"
```

---

### Task 6: dashboard reads profile targets

**Files:**
- Modify: `app/page.tsx` (lines 1–14 imports/constants, 15–18 state, 20–47 `load`, 66–82 header + macro grid)
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: `getProfile` from `@/lib/profile`; `computeTargets`, `Targets` from `@/lib/targets`.

- [ ] **Step 1: Replace the constant with profile-derived state**

In `app/page.tsx`:

Delete line 7: `const TARGETS = { kcal: 2350, protein: 225, carbs: 212, fat: 67 };`

Add imports after the existing ones:
```ts
import { getProfile } from "@/lib/profile";
import { computeTargets, type Targets } from "@/lib/targets";
```

Add state next to `meals`/`lifts`/`week`:
```ts
const [targets, setTargets] = useState<Targets | null | undefined>(undefined); // undefined = loading, null = no profile
```

Add a second effect (separate from the realtime one — profile isn't realtime):
```ts
useEffect(() => {
  getProfile()
    .then((p) => setTargets(p ? computeTargets(p) : null))
    .catch(() => setTargets(null));
}, []);
```

- [ ] **Step 2: Render header link + grid/setup card**

Replace the `<h1>` line with:
```tsx
<div className="flex items-baseline justify-between">
  <h1 className="text-2xl font-bold tracking-tight">Gainz</h1>
  <Link href="/profile" className="text-sm font-medium text-muted active:text-foreground">Profile</Link>
</div>
```

Replace the macro `<section className="grid grid-cols-4 gap-2">…</section>` block with:
```tsx
{targets === undefined ? (
  <section className="grid grid-cols-4 gap-2">
    {["kcal", "P", "C", "F"].map((label) => (
      <div key={label} className="h-[74px] rounded-2xl border border-border bg-surface" />
    ))}
  </section>
) : targets === null ? (
  <Link href="/profile"
    className="rounded-2xl border border-accent/40 bg-surface p-4 text-sm active:bg-surface-2">
    <p className="font-semibold text-foreground">Set up your targets</p>
    <p className="mt-1 text-muted">Add height, weight, and goal to get daily kcal and macros.</p>
  </Link>
) : (
  <section className="grid grid-cols-4 gap-2">
    {([["kcal", sum("calories"), targets.kcal],
       ["P", sum("protein_g"), targets.protein_g],
       ["C", sum("carbs_g"), targets.carbs_g],
       ["F", sum("fat_g"), targets.fat_g]] as const).map(([label, v, t]) => (
      <div key={label} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3 text-center">
        <p className="text-xl font-bold tabular-nums leading-none">{v}</p>
        <p className="text-[11px] leading-none text-muted">/{t} {label}</p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-accent"
            style={{ width: `${t > 0 ? Math.min(100, Math.round((v / t) * 100)) : 0}%` }} />
        </div>
      </div>
    ))}
  </section>
)}
```
Note the `t > 0` guard: carbs target can be 0 (floor case) and `v / 0` would produce `Infinity%`.

- [ ] **Step 3: Type-check, test, build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all clean; `grep -n TARGETS app/page.tsx` returns nothing.

- [ ] **Step 4: Manual check**

`npm run dev`, open `/`:
- With the profile saved in Task 5: grid shows `/2350 kcal`, `/223 P`, `/214 C`, `/67 F`; "Profile" link top-right navigates to `/profile`.
- Temporarily delete the row (Supabase Table Editor) and reload: setup card appears, tapping it goes to `/profile`. Re-save the profile.

- [ ] **Step 5: Update AGENTS.md**

In the **Stack & shape** list add:
```
- `lib/targets.ts`: pure macro-target math (Mifflin-St Jeor TDEE, fat 0.33 g/lb, phase-default protein, carbs fill). Unit-tested in `lib/targets.test.ts` (`npm test`, vitest). `lib/profile.ts` wraps the `profiles` row (one per user, RLS). `/profile` edits it; dashboard calls `computeTargets` — no hardcoded targets anywhere.
```
In **Docs** add: `Macro targets spec: docs/superpowers/specs/2026-08-30-macro-targets-design.md. Plan: docs/superpowers/plans/2026-08-30-macro-targets.md.`

- [ ] **Step 6: Commit and push**

```bash
git add app/page.tsx AGENTS.md
git commit -m "feat: dashboard reads macro targets from profile"
git push
```
Vercel auto-deploys from `main`. After deploy, open https://gainz-app-phi.vercel.app on the phone, confirm the grid shows the profile-derived targets.

---

## Self-review

- **Spec coverage:** formula + rounding (T3), reference numbers as test (T3), phase defaults (T1), age from birth_date w/ injected today (T2), MSJ male/female (T2), override vs estimate (T3), maintain ignores rate / bulk adds (T3), carbs floor + warning (T3), `profiles` table + RLS (T4), `lib/profile.ts` direct write not queue (T4), `/profile` form + live preview + TDEE line + phase resets defaults (T5), dashboard drops `TARGETS`, null-profile prompt, header link (T6), AGENTS.md (T6). Manual check of vault totals unaffected is implicit — nothing in this plan touches `vault_sync.py` or the meals/lifts tables.
- **Placeholders:** none.
- **Type consistency:** `Profile`, `Targets`, `Phase`, `Activity`, `Sex` defined in T1–T3 and imported by name in T4–T6; `getProfile`/`upsertProfile` signatures match between T4 and T5/T6; `ProfileRow` extends `Profile` so `computeTargets(p)` in T6 type-checks.
