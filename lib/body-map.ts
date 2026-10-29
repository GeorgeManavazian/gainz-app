import type { Muscle } from "./muscles";
import type { MuscleWeek } from "./muscle-week";
import { PART_MUSCLES, type BodyPart } from "./body-shapes";

/** Colour tier for a muscle's workout count this week (body heat-map). */
export type HitTier = "none" | "once" | "good" | "over";

/** 0 → none (gray), 1 → once (yellow/orange), 2–3 → good (green), 4+ → over (red). */
export function hitTier(hits: number): HitTier {
  if (hits >= 4) return "over";
  if (hits >= 2) return "good";
  if (hits >= 1) return "once";
  return "none";
}

/** A drawn part lights up by the most-trained muscle it contains; neutral parts (no muscles) return null. */
export function partHits(part: BodyPart, week: MuscleWeek): number | null {
  const ms: Muscle[] = PART_MUSCLES[part];
  if (ms.length === 0) return null;
  return Math.max(...ms.map((m) => week[m].hits));
}

/** Total primary sets across the muscles a part contains. */
export function partSets(part: BodyPart, week: MuscleWeek): number {
  return PART_MUSCLES[part].reduce((a, m) => a + week[m].sets, 0);
}
