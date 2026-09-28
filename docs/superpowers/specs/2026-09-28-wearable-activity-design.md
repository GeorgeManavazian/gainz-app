# Wearable Activity Adjustment — Design

Sub-project 7 of the Gainz roadmap (README: "Wearable integration — daily activity adjusts the calorie budget"). Depends on sub-project 1 (macro targets: `profiles`, `computeTargets` in `lib/targets.ts`).

## Purpose

Today's calorie budget is the same every day regardless of how active the day actually was. This adds a same-day bonus — never a penalty — when measured activity (Apple Health, fed in part by Oura) runs above the user's own recent baseline. A quiet day never tightens the budget; an active day loosens it.

Decisions taken in brainstorming:
- **Apple Health only.** Oura already writes its activity data into Apple Health, so there's no need for a second, separate Oura API integration. Single source, single bridge.
- **Push, not pull.** Apple exposes no cloud API for Health data — it lives on-device. An iOS Shortcuts automation is the only viable bridge; the server cannot poll for it.
- **Trigger: "App opened."** The Shortcuts personal automation fires each time the Gainz PWA is opened, reads today's Active Energy total so far (a live, partial-day snapshot), and POSTs it. The number is naturally low early in the day and rises as the day goes on and the user reopens the app — no lag, no separate overnight job.
- **Bonus-only, floored at zero.** `bonus = max(0, today − rolling baseline)`. An active day adds calories; a quiet day changes nothing. This matches the app's existing pattern of never auto-tightening a target (e.g. the TDEE stall nudge is suggest-only).
- **Rolling 14-day baseline**, consistent with the app's other 14-day windows (`COOLDOWN_DAYS`, the default slope window). Requires at least 7 of those 14 days to have data before the baseline is trusted; otherwise bonus is 0 (no wild swings off one or two data points).
- **Single source of truth for the number.** The bonus flows through `computeTargets` itself (new optional param), so the Diet tab and HUB card can never disagree about what today's target is.
- **Bonus lands in carbs.** Protein and fat floors are weight-based and don't change; extra calories from activity fill the carbs remainder, same as any other extra kcal already does in `computeTargets`.
- **Single-user auth.** This is the app's first server-to-server write (no Supabase browser session available from Shortcuts). The sync route is locked to one fixed user via a shared-secret token and a service-role Supabase client — not a general multi-user endpoint.

## Data model — `supabase/schema.sql`

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

Same shape as `weigh_ins`: one row per user per date, unique constraint doubling as the upsert key.

## Sync route — `app/api/health-sync/route.ts`

`POST`, body `{ date: string /* YYYY-MM-DD */; active_kcal: number }`.

- New env vars (server-only, never `NEXT_PUBLIC_`): `HEALTH_SYNC_TOKEN` (shared secret), `HEALTH_SYNC_USER_ID` (the one user's UUID), `SUPABASE_SERVICE_ROLE_KEY`.
- Reject if `Authorization: Bearer <token>` header doesn't match `HEALTH_SYNC_TOKEN` → `401`.
- Reject if `active_kcal < 0`, non-numeric, or `date` isn't a valid `YYYY-MM-DD` → `400`.
- On success: service-role Supabase client (bypasses RLS, since there's no user session) upserts into `health_activity` on `(user_id, date)` with `user_id = HEALTH_SYNC_USER_ID`. Upsert overwrites the existing row for that date, so reopening the app later the same day replaces the earlier, smaller total — not a second row.
- No fan-out, no other tables touched. A malformed or malicious request can, at worst, write one wrong row for one date behind a bearer token — it can't touch `meals`, `weigh_ins`, or any other user's data.

## Algorithm — `lib/activity-adjustment.ts` (pure, no I/O)

```ts
export const ACTIVITY_BASELINE_WINDOW_DAYS = 14;
export const ACTIVITY_MIN_BASELINE_DAYS = 7;

export type DailyActivity = { date: string /* YYYY-MM-DD */; active_kcal: number };

export function computeActivityBonus(
  history: DailyActivity[],
  today: string
): number
```

- Baseline window = the 14 calendar days strictly before `today` (`[today − 14, today − 1]`). Today's own (partial) row is never part of the baseline — only used as the comparison point.
- Days with no row are gaps, not zero — same rule as `computeAdaptiveTdee`'s `avgLoggedKcal`. `baselineDays` = count of rows found in that window.
- If `baselineDays < ACTIVITY_MIN_BASELINE_DAYS` → return `0` (not enough history to trust a baseline yet).
- `baseline` = mean `active_kcal` over those `baselineDays` rows.
- `today's row` = the `history` entry with `date === today`, or `0` if absent (e.g. the automation hasn't fired yet today).
- Return `Math.max(0, Math.round(todayActive - baseline))`.

## `lib/targets.ts` changes

`computeTargets(p: Profile, today: Date = new Date(), activityBonusKcal = 0): Targets` — new optional third param, default `0` so every existing call site (including all current tests) is unaffected.

- `rawKcal` gains `+ activityBonusKcal` after the existing cut/bulk/maintain delta, before rounding.
- `fat_g` and `protein_g` computation is unchanged (weight-based floors).
- `carbs_g`'s `remaining` calc already flows off `kcal`, so the bonus lands there automatically — no separate branch needed.
- `Targets` gains no new field; callers that want to show "+N kcal today" compute that separately from the same `computeActivityBonus` result they passed in, not by reading it back off `Targets`.

## Data flow — Diet tab and HUB

Both `app/(tabs)/diet/page.tsx` and `app/(tabs)/page.tsx` (HUB):

1. Fetch `health_activity` rows for the trailing `ACTIVITY_BASELINE_WINDOW_DAYS + 1` days (baseline window plus today), same query shape as the existing `weigh_ins` fetch.
2. `bonus = computeActivityBonus(rows, today)`.
3. `targets = computeTargets(profile, today, bonus)` — replaces today's `computeTargets(profile, today)` call at each site.
4. HUB card: when `bonus > 0`, show a small "+{bonus} kcal today (active)" note beside the target; when `0`, show nothing new — HUB is visually unchanged from today.
5. Diet tab: the kcal ring/target simply reflects the bumped `targets.kcal` — no separate bonus callout needed there, since the ring already communicates the number that matters for logging.

No changes to `meals`, `weigh_ins`, the offline queue, or the adaptive-TDEE suggestion flow — `computeAdaptiveTdee`'s own back-solve continues to use raw logged `meals` vs. weight trend, untouched by this feature.

## Error handling

- No `health_activity` rows at all (feature never set up, or Shortcuts not yet configured) → `computeActivityBonus` returns `0` on the first check → app behaves exactly as it does today. No new empty-state UI needed.
- Sync route: bad/missing token → `401`, nothing written. Malformed body → `400`, nothing written. A bad `date` (e.g. far future) can't corrupt today's number — it just upserts a row nobody reads yet, since only `[today−14, today]` is ever fetched.
- Clock skew between phone and server: `date` is computed and sent by the Shortcut off the phone's local date, matching how `weigh_ins.date` already works (client-supplied local date, not server `now()`).

## Testing

New `lib/activity-adjustment.test.ts`, mirroring `lib/adaptive-tdee.test.ts` style:
- Empty `history` → `0`.
- 6 days of baseline history → `0` (below `ACTIVITY_MIN_BASELINE_DAYS`); 7 → a real number (boundary).
- Today above baseline → exact worked number (e.g. baseline 400, today 650 → bonus `250`).
- Today below baseline → `0`, not negative (floor check).
- A gap day inside the 14-day window excluded from the baseline average, not counted as `0` — assert the average is unaffected.
- Today missing from `history` entirely (automation hasn't fired yet) → treated as `todayActive = 0` → bonus `0` (never negative, never throws).

`lib/targets.test.ts` additions:
- `computeTargets(profile, today)` (no third arg) — byte-identical output to before this change, confirming the default doesn't alter any existing call site.
- `computeTargets(profile, today, 200)` — `kcal` up by 200, `protein_g`/`fat_g` unchanged, `carbs_g` up by exactly what the remainder math already implies for +200 kcal.

Manual: set up the Shortcuts automation, open the app, confirm a row lands in `health_activity`; seed 7+ days of `health_activity` with a clear below/above-baseline pattern, confirm the HUB note and Diet ring both reflect the same bumped number; confirm a quiet day shows no note and an unchanged target.

## Also in this pass (parked cleanup, unrelated scope)

`lib/adaptive-tdee.test.ts`'s "fewer than 8 weigh-ins" test lost its intended isolation as a side effect of a late fix during the adaptive-TDEE work (still passes, just exercises the wrong branch now). One-line date-shift fix, called out in `Gainz-App-Vault/_STATUS.md`. Fixed alongside this feature since both touch `lib/`.

## Out of scope

Oura's own API/scores (readiness, HRV, strain) beyond what already flows through Apple Health, live intraday polling beyond "on app open," any change to `weigh_ins`, `meals`, or the adaptive-TDEE back-solve, multi-user support for the sync route (it's fixed to `HEALTH_SYNC_USER_ID` by design), a settings UI for configuring the sync token (set once by hand in Vercel env vars and the Shortcut itself).
