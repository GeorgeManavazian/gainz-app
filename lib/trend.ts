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
