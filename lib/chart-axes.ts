import { addDays, dayDiff } from "./trend";

/** Smallest clean step whose rounded-out axis needs at most five tick labels. */
export function yScale(lo: number, hi: number): { min: number; max: number; step: number } {
  for (const step of [1, 2, 5, 10, 20, 50, 100]) {
    const min = Math.floor(lo / step) * step, max = Math.ceil(hi / step) * step;
    if ((max - min) / step + 1 <= 5) return { min, max: Math.max(max, min + step), step };
  }
  return { min: Math.floor(lo / 100) * 100, max: Math.ceil(hi / 100) * 100, step: 100 };
}

/** Evenly spaced date ticks across [first, last] by calendar days, thinned so labels never collide. */
export function dateTicks(first: string, last: string, pxPerDay: number, minGapPx = 70): string[] {
  const span = dayDiff(first, last);
  if (span <= 0) return [first];
  const want = Math.max(2, Math.min(4, Math.floor((span * pxPerDay) / minGapPx) + 1));
  const out: string[] = [];
  for (let i = 0; i < want; i++) out.push(addDays(first, Math.round((i / (want - 1)) * span)));
  return [...new Set(out)];
}
