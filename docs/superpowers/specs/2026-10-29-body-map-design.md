# Weekly body map — replace the "This week" table

Date: 2026-10-29 · Status: approved by George in chat ("just build it") · Follows Workout tracking v2

## Intent

George on the Performance "This week" table: confusing, hard to look at. He wants a human body with the muscle groups coloured by how many workouts hit each muscle this week.

## Binding

- **Where:** Performance tab, in place of `WeeklyMuscles` (the table + last-3-weeks grid both go).
- **What:** two anatomical figures side by side, front and back, drawn from the MIT-licensed `react-body-highlighter` polygon set (100×200 viewBox, vendored into `lib/body-shapes.ts` with attribution). George rejected hand-drawn primitives ("the UGLIEST thing i have ever seen") and sent two reference apps with segmented-muscle figures. The dataset's parts are coarser than the 18 fine muscles, so each drawn part maps to one or more fine muscles (`PART_MUSCLES`): chest → upper/mid/lower chest; front deltoids → front + side delts; upper back → upper back + lats; abs + obliques → abs; quads + abductors → quads; hamstring + adductor → hamstrings; calves + soleus → calves; traps, rear delts, lower back, biceps, triceps, forearms, glutes 1:1. Head, neck, knees are neutral (never coloured). A part's colour comes from the **max** hits among its muscles. Triceps, forearms and calves appear on both views and select together.
- **Colour by hits this week** (`muscleWeek(...)[m].hits`, Monday-start week, same math as the strip):
  - 0 → gray (opaque token `surface-3`, `#4b4e68`; a translucent `muted/35` blended over neighbours)
  - 1 → yellow/orange (new token `warning`, `#fab387`)
  - 2–3 → green (`success`)
  - 4 or more → red (`danger`). George said "more than 3"; 3 is green.
- **Tap a part** → line under the figures: `Upper back & lats · 2× this week · 8 sets` (`×` literal; `0×` allowed), plus a smaller breakdown line when the part holds more than one fine muscle: `Upper back 2× · Lats 1×`. Default: `Tap a muscle`. Tapping the selected part again deselects.
- **Legend:** one faded row (`opacity-60`, `text-[10px] text-muted`): four dots in the four colours with `0 · 1 · 2–3 · 4+`. George: "fade the legend row, it's pretty self explanatory".
- Card keeps the `This week` heading and the `2× per muscle` caption.
- No hex outside `app/globals.css`. Fill/stroke via Tailwind v4 theme utilities (`fill-success` etc.).
- Pure helpers in `lib/body-map.ts`: `hitTier(hits)` (0/1/2–3/4+), `partHits(part, week)` (max over mapped muscles; null for neutral), `partSets(part, week)` (sum). Tests cover tiers, that every fine muscle is mapped, every drawn part is mapped + labelled, polygon data is numeric pairs.
- No schema, no new dependencies. In-workout strip unchanged.

## Left to the builder

Thin `stroke-background` between polygons; `stroke-foreground` on the selected part and on keyboard focus (`focus-visible`), no hidden focus ring. Each coloured part is a `<g role="button" tabIndex=0 aria-label aria-pressed>` wrapping its polygons; neutral parts are plain.

## Decisions

- 3 hits = green, 4+ red — from George's "more than 3".
- Faded legend kept rather than removed — "fade" read as de-emphasise.
- 12ui renders skipped; first attempt was hand-authored primitives, rejected on sight. Second attempt vendors real muscle polygons (MIT) — the only practical way to get segmented anatomy with semantic regions.
- Last-3-weeks history dropped with the table; nothing replaces it (George didn't ask for it).
