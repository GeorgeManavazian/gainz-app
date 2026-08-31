export type WeighIn = { date: string /* YYYY-MM-DD */; weight_lb: number };
export type TrendPoint = WeighIn & { trend: number };

export const EMA_ALPHA = 0.25;

/** Exponential moving average over weigh-ins. Input must be sorted ascending by date, one point per date; gaps between dates are ignored (each point is one step). */
export function emaTrend(points: WeighIn[], alpha: number = EMA_ALPHA): TrendPoint[] {
  const out: TrendPoint[] = [];
  let prev: number | null = null;
  for (const p of points) {
    const trend: number = prev === null ? p.weight_lb : prev + alpha * (p.weight_lb - prev);
    out.push({ ...p, trend });
    prev = trend;
  }
  return out;
}

export function trendWeight(points: WeighIn[]): number | null {
  const t = emaTrend(points);
  return t.length === 0 ? null : t[t.length - 1].trend;
}

export const SLOPE_WINDOW_DAYS = 14;
export const SLOPE_MIN_POINTS = 8;

const MS_PER_DAY = 86_400_000;

function toUtcMs(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(date: string, days: number): string {
  return fromUtcMs(toUtcMs(date) + days * MS_PER_DAY);
}

export function dayDiff(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

/**
 * Ordinary least-squares slope of raw weight vs day, over points dated within
 * [today − windowDays + 1, today]. lb per week. null if fewer than SLOPE_MIN_POINTS.
 */
export function slopeLbPerWk(
  points: WeighIn[],
  today: string,
  windowDays: number = SLOPE_WINDOW_DAYS
): number | null {
  const start = addDays(today, -(windowDays - 1));
  const inWindow = points.filter((p) => p.date >= start && p.date <= today);
  if (inWindow.length < SLOPE_MIN_POINTS) return null;

  const xs = inWindow.map((p) => dayDiff(start, p.date));
  const ys = inWindow.map((p) => p.weight_lb);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  return (num / den) * 7;
}

export type TrendPhase = "cut" | "maintain" | "bulk";
export type Assessment = "insufficient_data" | "on_track" | "stalled" | "too_fast";

export const STALL_SLOPE = 0.25;        // lb/wk: cut slope ≥ −0.25 (bulk ≤ +0.25) is a stall
export const TOO_FAST_MARGIN = 0.75;    // lb/wk beyond the target rate
export const KCAL_PER_LB_PER_WK = 500;  // 1 lb/wk ≈ 500 kcal/day
export const ADJUST_MIN = 100;
export const ADJUST_MAX = 250;

export function assessProgress(slope: number | null, phase: TrendPhase, rate: number): Assessment {
  if (slope === null) return "insufficient_data";
  if (phase === "maintain") return "on_track";
  // Normalise so "progress" is positive for both cut and bulk.
  const progress = phase === "cut" ? -slope : slope;
  if (progress <= STALL_SLOPE) return "stalled";
  if (progress > rate + TOO_FAST_MARGIN) return "too_fast";
  return "on_track";
}

/** kcal/day to subtract (cut) or add (bulk) when stalled. 0 if slope is null. */
export function suggestAdjustment(slope: number | null, phase: TrendPhase, rate: number): number {
  if (slope === null || phase === "maintain") return 0;
  const shortfall = Math.max(0, rate - Math.abs(slope));
  const raw = Math.round((shortfall * KCAL_PER_LB_PER_WK) / 50) * 50;
  return Math.min(ADJUST_MAX, Math.max(ADJUST_MIN, raw));
}

export const COOLDOWN_DAYS = 14;

/** True if an adjustment was applied less than COOLDOWN_DAYS ago. */
export function inCooldown(lastAdjustedIso: string | null, now: Date): boolean {
  if (!lastAdjustedIso) return false;
  const elapsedDays = (now.getTime() - new Date(lastAdjustedIso).getTime()) / 86_400_000;
  return elapsedDays < COOLDOWN_DAYS;
}
