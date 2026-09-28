# Wearable Activity Adjustment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A same-day calorie bonus, never a penalty, when Apple Health (fed in part by Oura) shows more activity today than the user's own 14-day baseline — surfaced on both the Diet tab and the HUB card, fed by an iOS Shortcuts automation that POSTs to a new authenticated sync route each time the app is opened.

**Architecture:** A new pure module, `lib/activity-adjustment.ts`, computes the bonus from a day-by-day activity array (mirrors `lib/adaptive-tdee.ts`'s style). `lib/targets.ts` gains an optional third parameter so the bonus flows through the existing kcal/macro math (lands in carbs, same as any extra kcal already does). A new authenticated route, `app/api/health-sync/route.ts`, is the only way data gets in — Apple exposes no cloud API, so an on-device Shortcuts automation pushes to it. The route's two pieces of real logic (token check, payload validation) live in a pure `lib/health-sync.ts` module so they're unit-testable without spinning up the route. `lib/health-activity.ts` is the client-side read path Diet/HUB use, mirroring `lib/weighins.ts`.

**Tech Stack:** TypeScript, Next.js (App Router, Route Handlers), Supabase (RLS + a service-role client for the one server-to-server write path), Vitest (`npm test` = `vitest run`).

**Spec:** `docs/superpowers/specs/2026-09-28-wearable-activity-design.md`

## Global Constraints

- `ACTIVITY_BASELINE_WINDOW_DAYS = 14`, `ACTIVITY_MIN_BASELINE_DAYS = 7` — fewer than 7 days of baseline history means bonus is always `0`.
- Baseline window is `[today − 14, today − 1]` — today's own (partial) row is never part of the baseline, only the comparison point.
- Gap days (no row) are skipped, never counted as `0` — same rule `lib/adaptive-tdee.ts` already uses.
- `bonus = max(0, round(todayActive − baseline))` — floored at zero. A quiet day never reduces the budget.
- New env vars, server-only, never `NEXT_PUBLIC_`-prefixed: `HEALTH_SYNC_TOKEN`, `HEALTH_SYNC_USER_ID`, `SUPABASE_SERVICE_ROLE_KEY`.
- `health_activity` table: one row per `(user_id, date)`, `unique(user_id, date)`, upsert on conflict — a later sync the same day overwrites, never duplicates.
- `computeTargets(p, today = new Date(), activityBonusKcal = 0)` — the new third param defaults to `0` so every existing call site and every existing test in `lib/targets.test.ts` is byte-identical unless it opts in.
- The bonus lands in carbs only — `protein_g` and `fat_g` stay weight-based, untouched.
- The sync route is single-user by design (`HEALTH_SYNC_USER_ID` is a fixed value, not derived from a session) — not a general multi-user endpoint.

## Review Focus

- Wrong or missing `Authorization` header on the sync route must `401` and must not write to `health_activity` — this is the app's first authenticated write path, so a silent bypass here is a real data-integrity risk, not a hypothetical.
- Malformed payload (`active_kcal` negative, non-numeric, or missing; `date` not `YYYY-MM-DD`) must `400`, never throw an unhandled error or write a bad row.
- Today missing from the fetched history entirely (automation hasn't fired yet today) must be treated as `todayActive = 0`, never throw or produce `NaN` — this is the normal state for the first few hours of every day.
- A day below baseline must produce bonus `0`, not a negative number — this is the "never penalize a rest day" guarantee the whole feature is built around.
- Adding a bonus on top of a profile that already warns "kcal too low for fat + protein floors" must be able to clear that warning once the bonus is large enough — confirms the bonus actually reaches the carbs remainder calculation, not just the total.

---

## Task 1: Fix the parked `adaptive-tdee.test.ts` isolation bug

Unrelated one-line cleanup noted in `Gainz-App-Vault/_STATUS.md`, done first since it's small and independent of everything else in this plan.

**Files:**
- Modify: `lib/adaptive-tdee.test.ts:37-42`

**Interfaces:** None — test-only change, no production code touched.

- [ ] **Step 1: Confirm the bug**

The test "null with fewer than 8 weigh-ins in the window, even with 14 logged days" builds its dates with `addDays(today, -i)` for `i = 0..13`, which includes `today` itself (offset `0`). But `computeAdaptiveTdee`'s intake window excludes today (`intakeEnd = addDays(today, -1)`), so only 13 of those 14 dates actually land in the window. The test now passes because `loggedDays (13) < ADAPTIVE_MIN_LOGGED_DAYS (14)` — the intake-insufficient branch — not because of the 7 weigh-ins it's supposed to be isolating.

Run: `npx vitest run lib/adaptive-tdee.test.ts -t "fewer than 8 weigh-ins"`
Expected: PASS (it already passes — confirming it passes for the wrong reason, not that it's broken).

- [ ] **Step 2: Fix the date generation to land all 14 days strictly before today**

In `lib/adaptive-tdee.test.ts`, change:

```ts
  it("null with fewer than 8 weigh-ins in the window, even with 14 logged days", () => {
    const dates = Array.from({ length: 14 }, (_, i) => addDays(today, -i));
```

to:

```ts
  it("null with fewer than 8 weigh-ins in the window, even with 14 logged days", () => {
    const dates = Array.from({ length: 14 }, (_, i) => addDays(today, -(i + 1)));
```

(matches the pattern already used two tests above it, at line 31).

- [ ] **Step 3: Run the test and confirm it now exercises the weigh-in branch**

Run: `npx vitest run lib/adaptive-tdee.test.ts`
Expected: PASS — all tests green, including this one. To double check it's isolating the right branch, temporarily change `weighSeries(today, 7, ...)` to `weighSeries(today, 8, ...)` in this test only, confirm it now FAILS (returns a number, not null) — proving 8 weigh-ins is the boundary this test is actually checking. Revert back to `7` before moving on.

- [ ] **Step 4: Commit**

```bash
git add lib/adaptive-tdee.test.ts
git commit -m "test(diet): fix adaptive-tdee boundary test isolation"
```

---

## Task 2: `lib/activity-adjustment.ts` — baseline/bonus algorithm

**Files:**
- Create: `lib/activity-adjustment.ts`
- Test: `lib/activity-adjustment.test.ts`

**Interfaces:**
- Consumes: nothing outside this file (pure, no imports needed beyond types it defines itself).
- Produces: `ACTIVITY_BASELINE_WINDOW_DAYS: number`, `ACTIVITY_MIN_BASELINE_DAYS: number`, `type DailyActivity = { date: string; active_kcal: number }`, `computeActivityBonus(history: DailyActivity[], today: string): number` — consumed by Task 4 (targets wiring is separate) and Tasks 8/9 (Diet/HUB pages).

- [ ] **Step 1: Write the failing tests**

Create `lib/activity-adjustment.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeActivityBonus, type DailyActivity } from "./activity-adjustment";
import { addDays } from "./trend";

const today = "2026-09-30";

function activityDays(dates: string[], active_kcal: number): DailyActivity[] {
  return dates.map((date) => ({ date, active_kcal }));
}

describe("computeActivityBonus", () => {
  it("0 with no history at all", () => {
    expect(computeActivityBonus([], today)).toBe(0);
  });

  it("0 with 6 days of baseline history (below ACTIVITY_MIN_BASELINE_DAYS)", () => {
    const dates = Array.from({ length: 6 }, (_, i) => addDays(today, -(i + 1)));
    const history = [...activityDays(dates, 300), { date: today, active_kcal: 900 }];
    expect(computeActivityBonus(history, today)).toBe(0);
  });

  it("a real number at exactly 7 days of baseline history", () => {
    const dates = Array.from({ length: 7 }, (_, i) => addDays(today, -(i + 1)));
    const history = [...activityDays(dates, 300), { date: today, active_kcal: 900 }];
    expect(computeActivityBonus(history, today)).toBe(600);
  });

  it("floors at 0 when today is below baseline — never a penalty", () => {
    const dates = Array.from({ length: 14 }, (_, i) => addDays(today, -(i + 1)));
    const history = [...activityDays(dates, 500), { date: today, active_kcal: 100 }];
    expect(computeActivityBonus(history, today)).toBe(0);
  });

  it("worked example: baseline 400, today 650 → bonus 250", () => {
    const dates = Array.from({ length: 14 }, (_, i) => addDays(today, -(i + 1)));
    const history = [...activityDays(dates, 400), { date: today, active_kcal: 650 }];
    expect(computeActivityBonus(history, today)).toBe(250);
  });

  it("today missing from history entirely → treated as 0 active, bonus 0", () => {
    const dates = Array.from({ length: 14 }, (_, i) => addDays(today, -(i + 1)));
    const history = activityDays(dates, 400);
    expect(computeActivityBonus(history, today)).toBe(0);
  });

  it("gap days inside the baseline window are excluded from the average, not counted as 0", () => {
    // 7 logged baseline days scattered across offsets 1-14, 7 gap days with no row at all.
    const dates = [1, 2, 4, 6, 8, 11, 14].map((offset) => addDays(today, -offset));
    const history = [...activityDays(dates, 400), { date: today, active_kcal: 900 }];
    expect(computeActivityBonus(history, today)).toBe(500);
  });

  it("ignores history rows outside the 14-day baseline window", () => {
    const dates = Array.from({ length: 7 }, (_, i) => addDays(today, -(i + 1)));
    const history = [...activityDays(dates, 400), { date: addDays(today, -30), active_kcal: 5000 }, { date: today, active_kcal: 900 }];
    expect(computeActivityBonus(history, today)).toBe(500);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/activity-adjustment.test.ts`
Expected: FAIL — `lib/activity-adjustment.ts` does not exist yet ("Cannot find module './activity-adjustment'").

- [ ] **Step 3: Write the implementation**

Create `lib/activity-adjustment.ts`:

```ts
import { addDays } from "./trend";

export const ACTIVITY_BASELINE_WINDOW_DAYS = 14;
export const ACTIVITY_MIN_BASELINE_DAYS = 7;

export type DailyActivity = { date: string /* YYYY-MM-DD */; active_kcal: number };

/**
 * Same-day activity bonus: how much more active energy today shows versus
 * the user's own trailing 14-day baseline, floored at 0 so a quiet day
 * never reduces the budget. Days with no row are gaps, never counted as 0.
 * Today's own row (if present) is never part of the baseline — only the
 * comparison point.
 */
export function computeActivityBonus(history: DailyActivity[], today: string): number {
  const start = addDays(today, -ACTIVITY_BASELINE_WINDOW_DAYS);
  const baselineEnd = addDays(today, -1);
  const inWindow = history.filter((d) => d.date >= start && d.date <= baselineEnd);
  if (inWindow.length < ACTIVITY_MIN_BASELINE_DAYS) return 0;

  const baseline = inWindow.reduce((sum, d) => sum + d.active_kcal, 0) / inWindow.length;
  const todayActive = history.find((d) => d.date === today)?.active_kcal ?? 0;
  return Math.max(0, Math.round(todayActive - baseline));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/activity-adjustment.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/activity-adjustment.ts lib/activity-adjustment.test.ts
git commit -m "feat(diet): add wearable activity bonus algorithm"
```

---

## Task 3: `lib/targets.ts` — thread the bonus through `computeTargets`

**Files:**
- Modify: `lib/targets.ts` (the `computeTargets` function)
- Modify: `lib/targets.test.ts` (add cases)

**Interfaces:**
- Consumes: nothing new.
- Produces: `computeTargets(p: Profile, today?: Date, activityBonusKcal?: number): Targets` — the new third param is consumed by Tasks 8/9 (Diet/HUB pages).

- [ ] **Step 1: Write the failing tests**

Add to `lib/targets.test.ts`, inside the existing `describe("computeTargets", ...)` block (after the "floors carbs at 0" test, before "defaults today to now"):

```ts
  it("activityBonusKcal defaults to 0 — byte-identical to calling with two args", () => {
    const withDefault = computeTargets(athlete, today);
    const explicitZero = computeTargets(athlete, today, 0);
    expect(withDefault).toEqual(explicitZero);
  });

  it("activityBonusKcal raises kcal and carbs, leaves protein and fat untouched", () => {
    const base = computeTargets(athlete, today);
    const bumped = computeTargets(athlete, today, 200);
    expect(bumped.kcal).toBe(base.kcal + 200);
    expect(bumped.protein_g).toBe(base.protein_g);
    expect(bumped.fat_g).toBe(base.fat_g);
    expect(bumped.carbs_g).toBe(base.carbs_g + 50); // +200 kcal / 4 kcal per carb gram
  });

  it("a large enough activityBonusKcal clears the too-low-kcal warning", () => {
    const starved = computeTargets({ ...athlete, tdee_override: 1400 }, today); // 900 kcal, warns
    expect(starved.warning).toBe("kcal too low for fat + protein floors");
    const fed = computeTargets({ ...athlete, tdee_override: 1400 }, today, 600); // 1500 kcal
    expect(fed.warning).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/targets.test.ts`
Expected: FAIL — `computeTargets` doesn't accept a third argument yet (TypeScript error / the extra tests fail since bonus has no effect).

- [ ] **Step 3: Write the implementation**

In `lib/targets.ts`, change:

```ts
export function computeTargets(p: Profile, today: Date = new Date()): Targets {
  const tdee_est = estimateTdee(p, today);
  const tdee = p.tdee_override ?? tdee_est;
  const delta = (p.rate_lb_per_wk * KCAL_PER_LB_FAT) / 7;
  const rawKcal = p.phase === "cut" ? tdee - delta : p.phase === "bulk" ? tdee + delta : tdee;
```

to:

```ts
export function computeTargets(p: Profile, today: Date = new Date(), activityBonusKcal: number = 0): Targets {
  const tdee_est = estimateTdee(p, today);
  const tdee = p.tdee_override ?? tdee_est;
  const delta = (p.rate_lb_per_wk * KCAL_PER_LB_FAT) / 7;
  const rawKcal = (p.phase === "cut" ? tdee - delta : p.phase === "bulk" ? tdee + delta : tdee) + activityBonusKcal;
```

Nothing else in the function changes — `fat_g`, `protein_g`, and the `carbs_g` remainder calc already flow off `kcal`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/targets.test.ts`
Expected: PASS — all tests green, including the 3 new ones.

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: PASS — every existing suite (including every current `computeTargets` call site's tests) unaffected by the new default param.

- [ ] **Step 6: Commit**

```bash
git add lib/targets.ts lib/targets.test.ts
git commit -m "feat(diet): thread activity bonus through computeTargets"
```

---

## Task 4: `lib/health-sync.ts` — sync route's pure logic

**Files:**
- Create: `lib/health-sync.ts`
- Test: `lib/health-sync.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `isAuthorized(header: string | null, token: string): boolean`, `parseHealthSyncBody(body: unknown): { date: string; active_kcal: number } | null` — both consumed by Task 6 (the route).

- [ ] **Step 1: Write the failing tests**

Create `lib/health-sync.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isAuthorized, parseHealthSyncBody } from "./health-sync";

describe("isAuthorized", () => {
  it("true when the header is exactly 'Bearer <token>'", () => {
    expect(isAuthorized("Bearer secret123", "secret123")).toBe(true);
  });
  it("false when the header is missing", () => {
    expect(isAuthorized(null, "secret123")).toBe(false);
  });
  it("false when the token doesn't match", () => {
    expect(isAuthorized("Bearer wrong", "secret123")).toBe(false);
  });
  it("false when the header is missing the 'Bearer ' prefix", () => {
    expect(isAuthorized("secret123", "secret123")).toBe(false);
  });
});

describe("parseHealthSyncBody", () => {
  it("parses a valid body", () => {
    expect(parseHealthSyncBody({ date: "2026-09-30", active_kcal: 450 }))
      .toEqual({ date: "2026-09-30", active_kcal: 450 });
  });
  it("null when active_kcal is negative", () => {
    expect(parseHealthSyncBody({ date: "2026-09-30", active_kcal: -1 })).toBeNull();
  });
  it("null when active_kcal is not a finite number", () => {
    expect(parseHealthSyncBody({ date: "2026-09-30", active_kcal: "450" })).toBeNull();
    expect(parseHealthSyncBody({ date: "2026-09-30", active_kcal: NaN })).toBeNull();
  });
  it("null when date isn't YYYY-MM-DD", () => {
    expect(parseHealthSyncBody({ date: "09-30-2026", active_kcal: 450 })).toBeNull();
    expect(parseHealthSyncBody({ date: "2026-9-30", active_kcal: 450 })).toBeNull();
  });
  it("null when date or active_kcal is missing", () => {
    expect(parseHealthSyncBody({ active_kcal: 450 })).toBeNull();
    expect(parseHealthSyncBody({ date: "2026-09-30" })).toBeNull();
  });
  it("null for non-object bodies", () => {
    expect(parseHealthSyncBody(null)).toBeNull();
    expect(parseHealthSyncBody("nope")).toBeNull();
    expect(parseHealthSyncBody(42)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/health-sync.test.ts`
Expected: FAIL — `lib/health-sync.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `lib/health-sync.ts`:

```ts
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Expects `Authorization: Bearer <token>` exactly — no other scheme accepted. */
export function isAuthorized(header: string | null, token: string): boolean {
  return header === `Bearer ${token}`;
}

/** Validates and narrows an unknown POST body for /api/health-sync. */
export function parseHealthSyncBody(body: unknown): { date: string; active_kcal: number } | null {
  if (typeof body !== "object" || body === null) return null;
  const { date, active_kcal } = body as Record<string, unknown>;
  if (typeof date !== "string" || !DATE_RE.test(date)) return null;
  if (typeof active_kcal !== "number" || !Number.isFinite(active_kcal) || active_kcal < 0) return null;
  return { date, active_kcal };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/health-sync.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/health-sync.ts lib/health-sync.test.ts
git commit -m "feat(sync): add health-sync auth and payload validation"
```

---

## Task 5: Schema block and env vars

**Files:**
- Modify: `supabase/schema.sql` (append new block)
- Modify: `.env.example`

**Interfaces:** None — no code consumes this yet; Task 6 depends on the table and env vars existing in the live Supabase project (applied by hand, per the existing append-only schema convention).

- [ ] **Step 1: Append the new table block**

At the end of `supabase/schema.sql`, add:

```sql

-- Sub-project 7: wearable activity (2026-09-28). Paste this block once.
create table if not exists health_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  date date not null,
  active_kcal numeric not null check (active_kcal >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table health_activity enable row level security;

create policy "own health_activity" on health_activity for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 2: Document the new env vars**

At the end of `.env.example`, add:

```
# Server-only. Wearable activity sync (/api/health-sync) — never prefix with NEXT_PUBLIC_.
SUPABASE_SERVICE_ROLE_KEY=<service role key, Supabase project settings > API>
HEALTH_SYNC_TOKEN=<random long secret you generate — reused in the Shortcuts automation>
HEALTH_SYNC_USER_ID=<your auth.users id, Supabase Table Editor > Authentication > Users>
```

- [ ] **Step 3: Apply the block to the live Supabase project**

Paste the new block from Step 1 into the Supabase SQL editor for the live project and run it. Confirm `health_activity` appears in the Table Editor with RLS enabled. (This step has no automated check — it's the same manual-apply convention every other schema block in this file already uses.)

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql .env.example
git commit -m "feat(sync): add health_activity table and sync env vars"
```

---

## Task 6: `lib/supabase-admin.ts` + `app/api/health-sync/route.ts` — the sync endpoint

**Files:**
- Create: `lib/supabase-admin.ts`
- Create: `app/api/health-sync/route.ts`
- Test: `app/api/health-sync/route.test.ts`

**Interfaces:**
- Consumes: `isAuthorized`, `parseHealthSyncBody` from `@/lib/health-sync` (Task 4); the `health_activity` table and `HEALTH_SYNC_TOKEN`/`HEALTH_SYNC_USER_ID`/`SUPABASE_SERVICE_ROLE_KEY` env vars (Task 5).
- Produces: `supabaseAdmin(): SupabaseClient` from `lib/supabase-admin.ts` — not consumed elsewhere in this plan, but is the seam this task's test mocks.

- [ ] **Step 1: Create the service-role client**

Create `lib/supabase-admin.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

/** Service-role client: bypasses RLS. Server-only — never import from a client component. */
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
```

- [ ] **Step 2: Write the failing route tests**

Create `app/api/health-sync/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const upsert = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: () => ({ from: () => ({ upsert }) }),
}));

process.env.HEALTH_SYNC_TOKEN = "test-token";
process.env.HEALTH_SYNC_USER_ID = "11111111-1111-1111-1111-111111111111";

const { POST } = await import("./route");

function req(body: unknown, token = "test-token"): Request {
  return new Request("http://localhost/api/health-sync", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => { upsert.mockClear(); });

describe("POST /api/health-sync", () => {
  it("401s and never writes when the token is wrong", async () => {
    const res = await POST(req({ date: "2026-09-30", active_kcal: 450 }, "wrong") as any);
    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("401s and never writes when the header is missing entirely", async () => {
    const bare = new Request("http://localhost/api/health-sync", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: "2026-09-30", active_kcal: 450 }),
    });
    const res = await POST(bare as any);
    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("400s and never writes on a malformed body", async () => {
    const res = await POST(req({ date: "2026-09-30", active_kcal: -5 }) as any);
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts with the fixed user id and 200s on a valid, authorized request", async () => {
    const res = await POST(req({ date: "2026-09-30", active_kcal: 450 }) as any);
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "11111111-1111-1111-1111-111111111111", date: "2026-09-30", active_kcal: 450 },
      { onConflict: "user_id,date" }
    );
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run app/api/health-sync/route.test.ts`
Expected: FAIL — `./route` does not exist yet.

- [ ] **Step 4: Write the route**

Create `app/api/health-sync/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { isAuthorized, parseHealthSyncBody } from "@/lib/health-sync";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  if (!isAuthorized(req.headers.get("authorization"), process.env.HEALTH_SYNC_TOKEN!)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const parsed = parseHealthSyncBody(body);
  if (!parsed) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const { error } = await supabaseAdmin()
    .from("health_activity")
    .upsert(
      { user_id: process.env.HEALTH_SYNC_USER_ID, date: parsed.date, active_kcal: parsed.active_kcal },
      { onConflict: "user_id,date" }
    );
  if (error) return NextResponse.json({ error: "db error" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run app/api/health-sync/route.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS — no regressions elsewhere.

- [ ] **Step 7: Manual end-to-end test against the live route**

Run: `npm run dev`. In another terminal:

```bash
curl -i -X POST http://localhost:3000/api/health-sync \
  -H "Authorization: Bearer <your HEALTH_SYNC_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-09-30","active_kcal":450}'
```

Expected: `200 {"ok":true}`, and a row appears in `health_activity` in the Supabase Table Editor. Re-run the same command with a different `active_kcal` — confirm the row is updated in place (upsert), not duplicated. Then retry with a wrong `Authorization` value — confirm `401` and no new/changed row.

- [ ] **Step 8: Set up the iOS Shortcuts automation**

On the phone: Shortcuts app → Automation → "+" → App → select Gainz (the home-screen PWA icon) → "Is Opened" → Add Action → build:
1. "Find Health Samples where Type is Active Energy, Start Date is Today" → sum the results (Shortcuts' "Find Health Samples" has a built-in sum option, or add "Calculate Statistics: Sum" on the result).
2. "Get Contents of URL": `https://<your-vercel-domain>/api/health-sync`, Method POST, Headers `Authorization: Bearer <HEALTH_SYNC_TOKEN>`, Request Body JSON `{ "date": <today's date formatted YYYY-MM-DD>, "active_kcal": <the sum from step 1> }`.

Turn off "Ask Before Running" so it fires silently. Open the app once and confirm a fresh row lands in `health_activity` with today's date.

- [ ] **Step 9: Commit**

```bash
git add lib/supabase-admin.ts app/api/health-sync/
git commit -m "feat(sync): add authenticated health-sync route"
```

---

## Task 7: `lib/health-activity.ts` — client read path

**Files:**
- Create: `lib/health-activity.ts`

**Interfaces:**
- Consumes: `supabase` from `@/lib/supabase`.
- Produces: `type HealthActivityRow = { date: string; active_kcal: number }`, `listHealthActivity(sinceDate: string): Promise<HealthActivityRow[]>` — consumed by Tasks 8 and 9.

No dedicated test — mirrors `lib/weighins.ts`, which is also untested directly (thin Supabase pass-through; the app has no test harness for live DB calls). Verified manually in Tasks 8/9.

- [ ] **Step 1: Write the file**

Create `lib/health-activity.ts`:

```ts
import { supabase } from "@/lib/supabase";

export type HealthActivityRow = { date: string; active_kcal: number };

export async function listHealthActivity(sinceDate: string): Promise<HealthActivityRow[]> {
  const { data, error } = await supabase
    .from("health_activity")
    .select("date,active_kcal")
    .gte("date", sinceDate)
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ date: r.date, active_kcal: Number(r.active_kcal) }));
}
```

- [ ] **Step 2: Confirm it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/health-activity.ts
git commit -m "feat(diet): add client read path for health_activity"
```

---

## Task 8: Wire the Diet tab

**Files:**
- Modify: `app/(tabs)/diet/page.tsx:12,101,104-132,151-155`

**Interfaces:**
- Consumes: `listHealthActivity` from `@/lib/health-activity` (Task 7); `computeActivityBonus`, `ACTIVITY_BASELINE_WINDOW_DAYS` from `@/lib/activity-adjustment` (Task 2); `computeTargets`'s new third param (Task 3).
- Produces: nothing new for other tasks — Task 9 (HUB) makes the equivalent change independently in a different file.

- [ ] **Step 1: Add imports and state**

In `app/(tabs)/diet/page.tsx`, change line 12 from:

```ts
import { computeAdaptiveTdee, ADAPTIVE_WINDOW_DAYS, type DailyKcal } from "@/lib/adaptive-tdee";
```

to:

```ts
import { computeAdaptiveTdee, ADAPTIVE_WINDOW_DAYS, type DailyKcal } from "@/lib/adaptive-tdee";
import { computeActivityBonus, ACTIVITY_BASELINE_WINDOW_DAYS } from "@/lib/activity-adjustment";
import { listHealthActivity, type HealthActivityRow } from "@/lib/health-activity";
```

Add a new state field at line 101, alongside `dailyKcal`:

```ts
  const [dailyKcal, setDailyKcal] = useState<DailyKcal[]>([]);
  const [activity, setActivity] = useState<HealthActivityRow[]>([]);
```

- [ ] **Step 2: Fetch activity history in `load()`**

In the `load` callback (lines 104-132), add `listHealthActivity` to the `Promise.allSettled` call and handle its result. Replace:

```ts
  const load = useCallback(async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (ADAPTIVE_WINDOW_DAYS - 1));
    const [w, p, m] = await Promise.allSettled([
      listWeighIns(),
      getProfile(),
      supabase.from("meals").select("*").gte("logged_at", start.toISOString()).order("logged_at"),
    ]);
    if (w.status === "fulfilled") { setRows(w.value); setErr(""); }
    else { setErr("Couldn't load weigh-ins."); }
    setProfile(p.status === "fulfilled" ? p.value : null);
```

with:

```ts
  const load = useCallback(async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (ADAPTIVE_WINDOW_DAYS - 1));
    const [w, p, m, a] = await Promise.allSettled([
      listWeighIns(),
      getProfile(),
      supabase.from("meals").select("*").gte("logged_at", start.toISOString()).order("logged_at"),
      listHealthActivity(addDays(localDateKey(), -ACTIVITY_BASELINE_WINDOW_DAYS)),
    ]);
    if (w.status === "fulfilled") { setRows(w.value); setErr(""); }
    else { setErr("Couldn't load weigh-ins."); }
    setProfile(p.status === "fulfilled" ? p.value : null);
    setActivity(a.status === "fulfilled" ? a.value : []);
```

- [ ] **Step 3: Compute the bonus and pass it into both `computeTargets` calls**

Replace lines 151-155:

```ts
  const targets = profile ? computeTargets({ ...profile, weight_lb: trend ?? profile.weight_lb }) : null;
  const adaptive = computeAdaptiveTdee(dailyKcal, rows, today);
  const adaptiveTargets = profile && adaptive
    ? computeTargets({ ...profile, weight_lb: trend ?? profile.weight_lb, tdee_override: adaptive.tdee })
    : null;
```

with:

```ts
  const activityBonus = computeActivityBonus(activity, today);
  const targets = profile
    ? computeTargets({ ...profile, weight_lb: trend ?? profile.weight_lb }, new Date(), activityBonus)
    : null;
  const adaptive = computeAdaptiveTdee(dailyKcal, rows, today);
  const adaptiveTargets = profile && adaptive
    ? computeTargets({ ...profile, weight_lb: trend ?? profile.weight_lb, tdee_override: adaptive.tdee }, new Date(), activityBonus)
    : null;
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS — no test covers `app/` (consistent with the rest of the codebase), so this confirms every `lib/` suite is still green after the wiring change.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, open the Diet tab.

Scenario A — no `health_activity` rows at all (today's exact behavior, unchanged): confirm the kcal ring/target is identical to before this change.

Scenario B — seed 7+ days of `health_activity` via the SQL editor averaging ~400 kcal, plus a row for today at 900 kcal: confirm the Diet tab's kcal target is exactly 500 higher than without today's row (reload after inserting today's row to see the jump).

Scenario C — seed today's row below the baseline average: confirm the kcal target is unchanged from the no-bonus case (never reduced).

- [ ] **Step 7: Commit**

```bash
git add "app/(tabs)/diet/page.tsx"
git commit -m "feat(diet): apply activity bonus to the Diet tab kcal target"
```

---

## Task 9: Wire the HUB card

**Files:**
- Modify: `app/(tabs)/page.tsx:11-12,70-87,113-114`

**Interfaces:**
- Consumes: same as Task 8 (`listHealthActivity`, `computeActivityBonus`, `ACTIVITY_BASELINE_WINDOW_DAYS`, `computeTargets`'s third param) — independent wiring in a different file, not dependent on Task 8's edits.
- Produces: nothing consumed elsewhere — this is the last task.

- [ ] **Step 1: Add imports and activity state**

Change lines 11-12 from:

```ts
import { listWeighIns, localDateKey, upsertWeighIn, type WeighInRow } from "@/lib/weighins";
import { addDays, slopeLbPerWk, trendWeight } from "@/lib/trend";
```

to:

```ts
import { listWeighIns, localDateKey, upsertWeighIn, type WeighInRow } from "@/lib/weighins";
import { addDays, slopeLbPerWk, trendWeight } from "@/lib/trend";
import { computeActivityBonus, ACTIVITY_BASELINE_WINDOW_DAYS } from "@/lib/activity-adjustment";
import { listHealthActivity, type HealthActivityRow } from "@/lib/health-activity";
```

Add a state field near the other `useState` declarations (alongside `weighIns`, around line 23):

```ts
  const [weighIns, setWeighIns] = useState<WeighInRow[]>([]);
  const [activity, setActivity] = useState<HealthActivityRow[]>([]);
```

- [ ] **Step 2: Fetch activity history in `loadTargets`**

Replace lines 70-76:

```ts
  const loadTargets = useCallback((soft = false) => {
    if (!soft) setProfile(undefined);
    return Promise.allSettled([getProfile(), listWeighIns(addDays(localDateKey(), -120))]).then(([p, w]) => {
      setWeighIns(w.status === "fulfilled" ? w.value : []);
      setProfile(p.status === "fulfilled" ? p.value : "error");
    });
  }, []);
```

with:

```ts
  const loadTargets = useCallback((soft = false) => {
    if (!soft) setProfile(undefined);
    return Promise.allSettled([
      getProfile(),
      listWeighIns(addDays(localDateKey(), -120)),
      listHealthActivity(addDays(localDateKey(), -ACTIVITY_BASELINE_WINDOW_DAYS)),
    ]).then(([p, w, a]) => {
      setWeighIns(w.status === "fulfilled" ? w.value : []);
      setProfile(p.status === "fulfilled" ? p.value : "error");
      setActivity(a.status === "fulfilled" ? a.value : []);
    });
  }, []);
```

- [ ] **Step 3: Compute the bonus and pass it into `computeTargets`**

Replace lines 81-87:

```ts
  const today = localDateKey();
  const trend = trendWeight(weighIns);
  const targets =
    profile === undefined ? undefined
    : profile === null ? null
    : profile === "error" ? "error"
    : computeTargets({ ...profile, weight_lb: trend ?? profile.weight_lb });
```

with:

```ts
  const today = localDateKey();
  const trend = trendWeight(weighIns);
  const activityBonus = computeActivityBonus(activity, today);
  const targets =
    profile === undefined ? undefined
    : profile === null ? null
    : profile === "error" ? "error"
    : computeTargets({ ...profile, weight_lb: trend ?? profile.weight_lb }, new Date(), activityBonus);
```

- [ ] **Step 4: Fill the existing "burn pill slot" placeholder**

Replace the comment at line 114:

```tsx
            {/* burn pill slot — hidden until Oura burn data exists (roadmap #6) */}
```

with:

```tsx
            {activityBonus > 0 && (
              <span className="flex h-9 items-center rounded-full border border-accent/30 bg-accent/10 px-3 text-[13px] font-semibold text-accent"
                aria-label={`Plus ${activityBonus} calories today from activity`}>
                +{activityBonus}
              </span>
            )}
```

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, open the HUB.

Scenario A — no bonus (no rows, or today at/below baseline): confirm no pill appears next to the profile icon, and the kcal ring target matches the Diet tab's target exactly (same number, same source of truth).

Scenario B — seed the same above-baseline data as Diet tab Task 8 Scenario B: confirm the pill shows "+500" and the kcal ring target is 500 higher than the no-bonus case, matching the Diet tab's target for the same data.

- [ ] **Step 8: Commit**

```bash
git add "app/(tabs)/page.tsx"
git commit -m "feat(hub): surface activity bonus pill and apply it to the kcal target"
```
