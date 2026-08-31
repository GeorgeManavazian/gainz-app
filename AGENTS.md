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
- Next.js 15 App Router + TS + Tailwind. Pages: `/` (dashboard: totals vs TARGETS, 7-day trend, realtime), `/login`, `/log/meal`, `/log/lift`.
- Supabase: auth (single user), `meals`/`lifts` tables w/ RLS (`supabase/schema.sql`), realtime publication on both.
- `lib/queue.ts`: offline queue (idb-keyval). Idempotent inserts (client UUID = row PK, 23505 = settled), isFlushing guard, session-gated flush, permanent-vs-transient error split, dead-letter key. Do not weaken these invariants.
- `app/api/food-search/route.ts`: server-side USDA proxy — `USDA_API_KEY` must never get a `NEXT_PUBLIC_` prefix.
- `scripts/vault_sync.py`: mirror of `~/.config/gainz/vault_sync.py` (launchd `com.gainz.vaultsync`, 20 min) — keep both copies identical when editing.
- Secrets: `.env.local` (URL, anon key, USDA key — mirrored in Vercel env). Service-role key ONLY in `~/.config/gainz/supabase_sync.json`, never in repo/Vercel.
- `lib/targets.ts`: pure macro-target math (Mifflin-St Jeor TDEE, fat 0.33 g/lb, phase-default protein, carbs fill). Unit-tested in `lib/targets.test.ts` (`npm test`, vitest). `lib/profile.ts` wraps the `profiles` row (one per user, RLS). `/profile` edits it; dashboard calls `computeTargets` — no hardcoded targets anywhere.

## Docs
Spec: `docs/superpowers/specs/2026-08-29-gainz-app-design.md`. Build plan: `docs/superpowers/plans/2026-08-29-gainz-app.md`. Macro targets spec: docs/superpowers/specs/2026-08-30-macro-targets-design.md. Plan: docs/superpowers/plans/2026-08-30-macro-targets.md.

## Known deferred items (from final review)
- food-search route is unauthenticated on the public URL (USDA quota exposure only)
- package.json still named "gainz-tmp"
- no service worker → no cold-start offline; meals need network for search anyway
- AuthGuard blank-flash pre-redirect; fetch/res.json unguarded in meal search
