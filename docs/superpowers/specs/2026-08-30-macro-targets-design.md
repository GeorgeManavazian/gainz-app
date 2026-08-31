# Macro Targets — Design

Sub-project 1 of the Gainz roadmap (targets → weigh-ins → workout flow → meal patterns → next-meal advice → Oura adjust → lift progress → pre-gym fuel). This spec covers only daily macro targets.

## Purpose

Replace the hardcoded `TARGETS` constant on the dashboard with per-user targets computed from a profile. Targets are the foundation every later feature reads: next-meal advice divides the remaining budget, Oura adjustment adds to it, stall detection lowers it. Designing this per-user from day one is what makes a public release possible later without a rewrite.

## Formula

Source: `~/Documents/Gainz/Profile.md` (George's research-derived formula), plus Mifflin-St Jeor for the TDEE estimate.

```
bmr_kcal   = 10·kg + 6.25·cm − 5·age + (sex == male ? 5 : −161)      # Mifflin-St Jeor
tdee_est   = bmr_kcal × activity_multiplier
tdee       = tdee_override ?? tdee_est
delta_kcal = rate_lb_per_wk × 3500 / 7        # 1.5 lb/wk → 750
kcal       = phase == cut  ? tdee − delta
           : phase == bulk ? tdee + delta
           : tdee
fat_g      = 0.33 × weight_lb                 # hormone floor, phase-independent
protein_g  = protein_g_per_lb × weight_lb     # default by phase, see below
carbs_g    = max(0, (kcal − 9·fat_g − 4·protein_g) / 4)
```

Activity multipliers: sedentary 1.2, light 1.375, moderate 1.55, active 1.725, very 1.9.

Protein default by phase when `protein_g_per_lb` is null: cut 1.1, maintain 1.0, bulk 1.0. User may override with any value in [0.8, 1.5].

Rate default by phase when creating a profile: cut 1.5, maintain 0, bulk 0.5. Rate for maintain is ignored (delta applied only for cut/bulk).

Rounding: round `kcal`, `fat_g`, `protein_g` to integers first, then compute `carbs_g` from the rounded values and round it. This keeps displayed macros consistent with displayed kcal to within a few kcal. If `kcal < 9·fat_g + 4·protein_g` the carbs floor at 0 and the result carries `warning: "kcal too low for fat + protein floors"` — UI shows it; no silent clamping.

Reference check (must be a unit test): 170 lb, cut, rate 1.5, protein 1.1 g/lb, override 3100 → 2350 kcal / 223 g protein / 67 g fat / 214 g carbs (855 kcal remaining after rounded fat + protein; 855 / 4 = 213.75 → 214). Profile.md's hand-rounded 225/212 differ slightly; the function's output is canonical from now on.

## Data model

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

`weight_lb` is a seed. When sub-project 3 (weigh-ins) lands, the dashboard passes the latest trend weight into `computeTargets` instead; the column stays as fallback for users with no weigh-ins.

No realtime publication needed — profile changes are made on the same device that reads them; dashboard refetches on mount.

## Components

**`lib/targets.ts`** — pure, no I/O.
```ts
export type Profile = { sex; birth_date; height_in; weight_lb; activity; phase;
  rate_lb_per_wk; protein_g_per_lb: number | null; tdee_override: number | null };
export type Targets = { kcal; protein_g; carbs_g; fat_g; tdee: number; tdee_est: number;
  warning?: string };
export function computeTargets(p: Profile, today?: Date): Targets;
export function defaultProteinPerLb(phase): number;
export function defaultRate(phase): number;
```
`today` param exists so age is deterministic in tests.

**`lib/profile.ts`** — `getProfile(): Promise<Profile | null>`, `upsertProfile(p)`. Thin Supabase wrappers. Direct write, not through the offline queue: profile edits happen at home, and queueing an upsert against a PK row has no idempotency story worth building yet.

**`app/profile/page.tsx`** — form for every column. Live preview panel below the form recomputes targets on every keystroke via `computeTargets`, shows `TDEE est. 3xxx` and, when override set, `using override 3100`. Phase change resets rate and protein to defaults unless the user has hand-edited them this session. Save → upsert → back to `/`.

**`app/page.tsx`** — remove `TARGETS`. On load also fetch profile. Null profile → replace the macro grid with a single card linking to `/profile` ("Set up your targets"). Otherwise `computeTargets(profile)` feeds the existing grid. Add a small link to `/profile` in the header.

## Testing

Add vitest (`npm test`). `lib/targets.test.ts`:
- reference check above (George's numbers)
- Mifflin-St Jeor male + female known values
- override beats estimate; null override uses estimate
- maintain ignores rate; bulk adds delta
- carbs floor at 0 with warning
- phase defaults for protein and rate
- age computed from `birth_date` relative to injected `today` (birthday not yet passed this year)

Manual: fill profile on phone, confirm dashboard grid matches preview, confirm vault totals unaffected (targets are not synced — vault has its own numbers in Profile.md; keeping them aligned is a manual step for now).

## Out of scope

Weigh-in input, trend weight, Oura activity adjustment, adaptive TDEE, onboarding flow for new users, syncing targets to the vault.
