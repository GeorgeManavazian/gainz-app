<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Gainz App

Single-user fitness-logging PWA for George — meals (USDA macro lookup) + lifts, feeding his Obsidian vault at ~/Documents/Gainz. Deployed at https://gainz-app-phi.vercel.app (Vercel, auto-deploys from main on GitHub GeorgeManavazian/gainz-app).

## Status
v1 shipped 2026-08-30 and works end-to-end, but George considers it unfinished and is chat-logging in his vault until it's polished. Ask him for his backlog before assuming what to build.

## Stack & shape
- Next.js 16 App Router + TS + Tailwind. Pages: `/` (HUB: calorie/macro gauges, next-meal, today, compact weigh-in), `/diet`, `/performance` in `app/(tabs)/` route group with `components/TabBar.tsx`; pushes: `/log/meal`, `/workout/new`, `/workout/[id]`, `/profile`, `/login`. `/weight` removed (content lives in `/diet`).
- Palette: lavender/navy tokens in `app/globals.css` (`--accent #b4a2f5` etc.), chosen 2026-09-01; components must use tokens, never hex.
- Supabase: auth (single user), `meals`/`lifts`/`workouts`/`profiles`/`weigh_ins` tables w/ RLS (`supabase/schema.sql`), realtime publication on `meals`/`lifts`. `lifts.workout_id` is a nullable FK to `workouts` (null = historic / chat-logged, not tied to a session).
- `lib/queue.ts`: offline queue (idb-keyval). Items are `{ table: "meals" | "lifts" | "workouts", op: "insert" | "update", entry, ... }`; old `{ kind }` items are normalised on read. Idempotent inserts (client UUID = row PK, 23505 = settled), isFlushing guard, session-gated flush, permanent-vs-transient error split, dead-letter key, strict FIFO (flush breaks on the first transient failure — nothing behind it may land out of order), never-overtake (a new item always queues behind whatever's already waiting, even if it could send immediately). Do not weaken these invariants.
- `app/api/food-search/route.ts`: server-side USDA proxy — `USDA_API_KEY` must never get a `NEXT_PUBLIC_` prefix.
- `scripts/vault_sync.py`: mirror of `~/.config/gainz/vault_sync.py` (launchd `com.gainz.vaultsync`, 20 min) — keep both copies identical when editing.
- Secrets: `.env.local` (URL, anon key, USDA key — mirrored in Vercel env). Service-role key ONLY in `~/.config/gainz/supabase_sync.json`, never in repo/Vercel.
- `lib/targets.ts`: pure macro-target math (Mifflin-St Jeor TDEE, fat 0.33 g/lb, phase-default protein, carbs fill). Unit-tested in `lib/targets.test.ts` (`npm test`, vitest). `lib/profile.ts` wraps the `profiles` row (one per user, RLS). `/profile` edits it; dashboard calls `computeTargets` — no hardcoded targets anywhere.
- `lib/trend.ts`: pure weight math — EMA trend (α 0.25), 14-day OLS slope (≥8 points), stall/too-fast assessment, kcal suggestion (100–250, ×500/lb·wk), 14-day cooldown. Tested in `lib/trend.test.ts`. `lib/weighins.ts` wraps `weigh_ins` (one row per user per local date, upsert on `(user_id,date)`, direct writes — not the queue). `/diet` = chart + stall card + weigh-in history; HUB carries the compact `WeighInCard`; trend weight feeds `computeTargets`.
- `lib/exercises.ts`: static exercise library (~147 entries, grouped by `MuscleGroup`); indicator lifts are matched under their exact library names.
- `lib/workouts.ts`: pure workout/session logic (recents, last-session lookup, e1rm, summaries) — unit-tested in `lib/workouts.test.ts`.
- `lib/workouts-db.ts`: workout/lift data access — client-generated ids, `sessionStorage` cache per workout, and a `gainz-active-workout` `localStorage` pointer (set on start, cleared on end/delete) so the active workout survives a reload even before the create insert has landed.
- `lib/hub.ts`: ring fractions, next-meal placeholder — real #5 replaces the math.
- `lib/progress.ts`: e1RM sessions, INDICATORS with Cut Protocol baselines.
- `components/Ring.tsx`: 270° gauge.
- `components/LineChart.tsx`: line chart visualization.
- `components/Wheel.tsx`: the scroll-wheel picker used for sets/reps/weight in the set sheet.

## Deploy order
Every sub-project's `supabase/schema.sql` block must be pasted into the Supabase SQL editor BEFORE pushing `main` — inserts against a missing table/column are permanent rejections and dead-letter silently. Sub-project 3 block: `workouts` + `lifts.workout_id`. One-time backfill after applying: rename the `lifts.exercise` row `DB Chest press` → `DB Chest Press`.

## Docs
Spec: `docs/superpowers/specs/2026-08-29-gainz-app-design.md`. Build plan: `docs/superpowers/plans/2026-08-29-gainz-app.md`. Macro targets spec: docs/superpowers/specs/2026-08-30-macro-targets-design.md. Plan: docs/superpowers/plans/2026-08-30-macro-targets.md.
Weigh-ins spec: docs/superpowers/specs/2026-08-30-weigh-ins-design.md. Plan: docs/superpowers/plans/2026-08-30-weigh-ins.md. Design: docs/superpowers/design/2026-08-30-weight-page-12ui-A.png.
Workout flow spec: `docs/superpowers/specs/2026-09-01-workout-flow-design.md`. Plan: `docs/superpowers/plans/2026-09-01-workout-flow.md`. Design: `docs/superpowers/design/2026-09-01-workout-12ui-C.png`; branch screens: `docs/superpowers/design/2026-09-01-workout-branch-a-new-workout.png`, `docs/superpowers/design/2026-09-01-workout-branch-b-exercise-list.png`, `docs/superpowers/design/2026-09-01-workout-branch-c-summary.png`.
Hub tabs spec: `docs/superpowers/specs/2026-09-01-hub-tabs-design.md`. Plan: `docs/superpowers/plans/2026-09-01-hub-tabs.md`. Designs: `docs/superpowers/design/2026-09-01-hub-tabs-*.png`.

## Sub-project 4a — Meal patterns (2026-09-01)
Saved meals: HUB "Save as meal" sheet → `meal_patterns` (jsonb items, direct writes) → `/log/meal` "Your meals" → `/log/meal/pattern/[id]` review (edit grams, ✕ per row, Log all = N `logMeal` inserts via the queue, Delete meal). Pure logic + tests in `lib/patterns.ts`. Deferred: swaps, fits-your-macros, seeding from Daily notes, building a pattern from search, editing a saved pattern.
SQL to paste once: the `meal_patterns` block at the end of `supabase/schema.sql`.

### 4b — Meal builder (2026-09-08)
`/log/meal/new`: name + lines from `FoodPicker` (search extracted from the log page into `components/FoodPicker.tsx`) and/or `MacroSheet` manual lines (`manualItem`: grams = servings, per100g = macros × 100, `manual: true`); saves via `createPattern`. Review page shows "srv" for manual lines. Deferred: editing saved meals, reordering, drafts.

## Known deferred items (from final review)
- food-search route is unauthenticated on the public URL (USDA quota exposure only)
- package.json still named "gainz-tmp"
- no service worker → no cold-start offline; meals need network for search anyway
- AuthGuard blank-flash pre-redirect; fetch/res.json unguarded in meal search
