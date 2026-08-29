# Gainz App — Design

## Purpose

A mobile-installable dashboard for logging meals and lifts in real time, from anywhere, without needing a laptop on or a chat session open. Replaces live chat-based logging as the day-to-day capture surface. The Obsidian vault at `~/Documents/Gainz` remains the source of truth for coaching (Profile.md, Progress.base, burnout-watch) — this app feeds it, it doesn't replace it.

## Architecture

```
Phone (PWA, installed to home screen)
   |  writes/reads (realtime)
   v
Supabase (Postgres + Auth + Realtime)
   ^  polls every ~20 min, marks rows synced
   |
Mac: vault_sync.py (launchd, same pattern as oura_pull.py)
   |  appends rows, recomputes daily totals
   v
Obsidian vault: Daily/YYYY-MM-DD.md
```

Single user (George). Auth exists to keep the publicly-hosted app private, not for multi-tenancy.

## Components

**Frontend — Next.js PWA, hosted on Vercel (free tier)**
- `Log Meal` screen: text search box hits USDA FoodData Central (`/v1/foods/search`), shows matches, user picks one and enters grams, macros scale from the food's per-100g values and are shown before saving.
- `Log Lift` screen: exercise name (free text, autocomplete from prior entries), sets, reps, weight, optional note.
- `Dashboard` screen: today's meal list + running totals, today's lifts, last 7 days trend (weight/calories from Supabase, mirrors what `Progress.base` shows locally).
- Auth: Supabase email/password login, session persisted.
- Offline queue: writes attempted while offline (or on fetch failure) are queued in IndexedDB and flushed on reconnect (`window.addEventListener('online', ...)` plus a retry timer) — gym basements have bad signal.

**Backend — Supabase (free tier)**
- Postgres tables, Row-Level Security scoped to `auth.uid()`.
- Realtime subscriptions on both tables so the dashboard updates live across devices/tabs without polling.
- USDA API key kept server-side in a Next.js API route (never shipped to the client).

**Data model**

```sql
create table meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  logged_at timestamptz not null default now(),
  food_name text not null,
  grams numeric not null,
  calories numeric not null,
  protein_g numeric not null,
  carbs_g numeric not null,
  fat_g numeric not null,
  fdc_id text,
  synced_to_vault boolean not null default false
);

create table lifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  logged_at timestamptz not null default now(),
  exercise text not null,
  sets integer not null,
  reps integer not null,
  weight numeric not null,
  notes text,
  synced_to_vault boolean not null default false
);
```

RLS policy on both tables: `user_id = auth.uid()` for select/insert/update.

**Vault sync agent — `~/.config/gainz/vault_sync.py`**
- Runs via launchd every ~20 minutes while the Mac is on (mirrors `com.gainz.ourapull`), plus can be triggered on demand.
- Queries Supabase for rows where `synced_to_vault = false`, ordered by `logged_at`.
- For each row, resolves the target `Daily/YYYY-MM-DD.md` note (creating from `Templates/Daily Template.md` if missing) and appends a row to the Meals or Lifts table in that note.
- After processing a day's batch, recomputes that day's frontmatter totals (`calories`, `protein`, `carbs`, `fat`) as the sum of all meals logged for that date.
- Marks processed rows `synced_to_vault = true` in Supabase so re-runs don't duplicate.
- Uses the same credential-outside-vault convention as the Oura integration: Supabase service key lives in `~/.config/gainz/`, never in the vault or the app repo.

## Out of scope (v1)

- Multi-user support — this is single-user software.
- Editing/deleting past entries from the app (fix mistakes via chat/vault directly for now).
- Push notifications from the app.
- Migrating existing chat-logged history into Supabase — the vault's existing history stays as-is; the app only handles logging going forward.

## Testing

No formal test suite for a personal app at this scale. Verification is manual per milestone:
- Log a meal on the phone → confirm it appears on the dashboard in real time, and appears in the correct `Daily/*.md` note after the next sync run.
- Log a lift → same check.
- Kill wifi mid-log → confirm it queues and sends once reconnected.
- Confirm RLS actually blocks an unauthenticated request (curl the API without a session token, expect a rejection).
