/** Colour tier for a muscle's workout count this week (body heat-map). */
export type HitTier = "none" | "once" | "good" | "over";

/** 0 → none (gray), 1 → once (yellow/orange), 2–3 → good (green), 4+ → over (red). */
export function hitTier(hits: number): HitTier {
  if (hits >= 4) return "over";
  if (hits >= 2) return "good";
  if (hits >= 1) return "once";
  return "none";
}
