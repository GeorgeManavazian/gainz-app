# Weekly body map — replace the "This week" table

Date: 2026-10-29 · Status: approved by George in chat ("just build it") · Follows Workout tracking v2

## Intent

George on the Performance "This week" table: confusing, hard to look at. He wants a human body with the muscle groups coloured by how many workouts hit each muscle this week.

## Binding

- **Where:** Performance tab, in place of `WeeklyMuscles` (the table + last-3-weeks grid both go).
- **What:** two stylised silhouettes side by side, front and back. Each of the 18 fine muscles (`lib/muscles.ts`) is one tappable region on exactly one figure. Front: upper chest, mid chest, lower chest, front delts, side delts, biceps, forearms, abs, quads. Back: traps, rear delts, upper back, lats, lower back, triceps, glutes, hamstrings, calves.
- **Colour by hits this week** (`muscleWeek(...)[m].hits`, Monday-start week, same math as the strip):
  - 0 → gray (`fill-muted/35`)
  - 1 → yellow/orange (new token `warning`, `#fab387`)
  - 2–3 → green (`success`)
  - 4 or more → red (`danger`). George said "more than 3"; 3 is green.
- **Tap a muscle** → one line under the figures: `Lats · 2× this week · 8 sets` (`×` literal; `0×` allowed). Default line when nothing selected: `Tap a muscle`. Tapping the selected muscle again deselects.
- **Legend:** one faded row (`opacity-60`, `text-[10px] text-muted`): four dots in the four colours with `0 · 1 · 2–3 · 4+`. George: "fade the legend row, it's pretty self explanatory".
- Card keeps the `This week` heading and the `2× per muscle` caption.
- No hex outside `app/globals.css`. Fill/stroke via Tailwind v4 theme utilities (`fill-success` etc.).
- Pure tier helper in `lib/body-map.ts`: `export type HitTier = "none" | "once" | "good" | "over"; export function hitTier(hits: number): HitTier;` with vitest coverage (0, 1, 2, 3, 4, 7, negative → "none").
- No schema, no new dependencies. In-workout strip unchanged.

## Left to the builder

SVG geometry. Keep it stylised (primitives + simple paths), symmetric, with a thin `stroke-background` between regions so adjacent same-colour muscles stay distinguishable, and a 2px `stroke-foreground` on the selected region. Each region has `role="button"`, `aria-label="<Muscle name>"`, `aria-pressed`.

## Decisions

- 3 hits = green, 4+ red — from George's "more than 3".
- Faded legend kept rather than removed — "fade" read as de-emphasise.
- 12ui renders skipped: service 429'd two sessions ago and an image→code conversion can't produce semantic per-muscle regions; hand-authored SVG.
- Last-3-weeks history dropped with the table; nothing replaces it (George didn't ask for it).
