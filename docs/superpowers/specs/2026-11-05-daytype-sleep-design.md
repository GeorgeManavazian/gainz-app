# Training-day vs rest-day targets + morning sleep tap

Date: 2026-11-05 · Status: George: "go" (meal timing round 2, order approved 2026-11-03)

## Binding
- **Day-type targets.** `computeTargets(p, today, bonus, dayType)`; kcal and protein unchanged. Fat per lb: training 0.27, rest 0.40 (null = old 0.33, used by the profile preview). Carbs are the plug, so they rise on training days and fall on rest days. 170 lb reference: fat 46 g training / 68 g rest.
- `dayTypeFor({ active, doneToday, usualTraining, now })` (`lib/day-type.ts`): training when a session is running or done today, or the learned usual session for this weekday is ahead / within 3 h of its start; else rest. HUB + Diet use it; HUB shows `Training day · carbs up` / `Rest day · fat up` under the kcal ring. Meal-timing composition picks this up automatically (pre/post earmark is 60 % of the day's carbs).
- **Sleep tap.** `sleep_logs` (Sub-project 11): one row per user per date, `quality` 1–5, RLS. `components/SleepTap` on the HUB under the weigh-in: "How did you sleep?", five buttons (Awful · Poor · OK · Good · Great), saves on tap, tap again to change. Keyed to today's date (the morning you woke).
- No correlations yet; they need ~3 weeks of taps.

## Decisions
- 0.27 g/lb fat on training days keeps fat ≈ 16–20 % of kcal for a typical cut, above the usual ~0.25 g/lb hormonal floor. Claude's call.
- Missed usual session (> 3 h past) flips the day to rest so the fat/carb split follows what actually happened.
