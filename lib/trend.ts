export type WeighIn = { date: string /* YYYY-MM-DD */; weight_lb: number };
export type TrendPoint = WeighIn & { trend: number };

export const EMA_ALPHA = 0.1;

/** Exponential moving average over weigh-ins in order. Gaps between dates are ignored. */
export function emaTrend(points: WeighIn[], alpha: number = EMA_ALPHA): TrendPoint[] {
  const out: TrendPoint[] = [];
  let prev: number | null = null;
  for (const p of points) {
    const trend = prev === null ? p.weight_lb : prev + alpha * (p.weight_lb - prev);
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
  return (num / den) * 7;
}
