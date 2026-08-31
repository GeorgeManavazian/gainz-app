"use client";
import { useMemo, useState } from "react";
import { dayDiff, type TrendPoint } from "@/lib/trend";

const W = 360, H = 180;
const PAD = { top: 8, right: 8, bottom: 22, left: 34 };

function niceStep(range: number): number {
  for (const s of [1, 2, 4, 5, 10, 20]) if (range / s <= 5) return s;
  return 50;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function WeightChart({ points }: { points: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null); // index into points

  const geo = useMemo(() => {
    if (points.length === 0) return null;
    const first = points[0].date;
    const spanDays = Math.max(1, dayDiff(first, points[points.length - 1].date));
    const ws = points.flatMap((p) => [p.weight_lb, p.trend]);
    const lo = Math.floor(Math.min(...ws) - 1), hi = Math.ceil(Math.max(...ws) + 1);
    const step = niceStep(hi - lo);
    const yMin = Math.floor(lo / step) * step, yMax = Math.ceil(hi / step) * step;
    const x = (d: string) => PAD.left + (dayDiff(first, d) / spanDays) * (W - PAD.left - PAD.right);
    const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);
    const yTicks: number[] = [];
    for (let v = yMin; v <= yMax; v += step) yTicks.push(v);
    const tickCount = Math.min(4, points.length);
    const xTicks = Array.from({ length: tickCount }, (_, i) =>
      points[Math.round((i / Math.max(1, tickCount - 1)) * (points.length - 1))].date);
    const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.date).toFixed(1)},${y(p.trend).toFixed(1)}`).join(" ");
    return { x, y, yTicks, xTicks, path };
  }, [points]);

  if (!geo) {
    return <p className="py-10 text-center text-sm text-muted">No weigh-ins yet</p>;
  }
  const { x, y, yTicks, xTicks, path } = geo;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0, bestD = Infinity;
    points.forEach((p, i) => { const d = Math.abs(x(p.date) - px); if (d < bestD) { bestD = d; best = i; } });
    setHover(best);
  }

  const hp = hover === null ? null : points[hover];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Body weight with trend line"
        className="block touch-none select-none"
        onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--surface-2)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill="var(--muted)">{v}</text>
          </g>
        ))}
        {xTicks.map((d) => (
          <text key={d} x={x(d)} y={H - 6} textAnchor="middle" fontSize={8} fill="var(--muted)">{fmtDate(d)}</text>
        ))}
        {hp && <line x1={x(hp.date)} x2={x(hp.date)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--border)" strokeWidth={1} />}
        {points.map((p) => (
          <circle key={p.date} cx={x(p.date)} cy={y(p.weight_lb)} r={4} fill="var(--muted)" stroke="var(--surface)" strokeWidth={2} />
        ))}
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hp && <circle cx={x(hp.date)} cy={y(hp.trend)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />}
      </svg>
      {hp && (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs shadow">
          <span className="font-semibold tabular-nums text-foreground">{hp.weight_lb.toFixed(1)} lb</span>
          <span className="text-muted"> · trend {hp.trend.toFixed(1)} · {fmtDate(hp.date)}</span>
        </div>
      )}
      <div className="mt-2 flex justify-center gap-5 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-muted" />Daily weigh-in</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded bg-accent" />Trend</span>
      </div>
    </div>
  );
}
