"use client";
import { useEffect, useMemo, useState } from "react";
import { dayDiff, type TrendPoint } from "@/lib/trend";

const W = 360, H = 190;
const PAD = { top: 14, right: 14, bottom: 22, left: 34 };

function niceStep(range: number): number {
  for (const s of [1, 2, 4, 5, 10, 20]) if (range / s <= 5) return s;
  return 50;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Catmull-Rom → cubic bezier smoothing. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

export default function WeightChart({ points }: { points: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null); // index into points

  useEffect(() => { setHover(null); }, [points]);

  const geo = useMemo(() => {
    if (points.length === 0) return null;
    const first = points[0].date;
    const spanDays = Math.max(1, dayDiff(first, points[points.length - 1].date));
    const ws = points.flatMap((p) => [p.weight_lb, p.trend]);
    const lo = Math.floor(Math.min(...ws) - 1), hi = Math.ceil(Math.max(...ws) + 1);
    const step = niceStep(hi - lo);
    const yMin = Math.floor(lo / step) * step, yMax = Math.ceil(hi / step) * step;
    const x = (d: string) => points.length === 1 ? (PAD.left + W - PAD.right) / 2 : PAD.left + (dayDiff(first, d) / spanDays) * (W - PAD.left - PAD.right);
    const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);
    const yTicks: number[] = [];
    for (let v = yMin; v <= yMax; v += step) yTicks.push(v);
    const tickCount = Math.min(4, points.length);
    const xTicks = Array.from({ length: tickCount }, (_, i) =>
      points[Math.round((i / Math.max(1, tickCount - 1)) * (points.length - 1))].date);
    const pts = points.map((p) => ({ x: x(p.date), y: y(p.trend) }));
    const line = smoothPath(pts);
    const baseline = H - PAD.bottom;
    const area = points.length > 1
      ? `${line} L${pts[pts.length - 1].x.toFixed(1)},${baseline} L${pts[0].x.toFixed(1)},${baseline} Z`
      : "";
    return { x, y, yTicks, xTicks, line, area };
  }, [points]);

  if (!geo) {
    return <p className="py-10 text-center text-sm text-muted">No weigh-ins yet</p>;
  }
  const { x, y, yTicks, xTicks, line, area } = geo;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0, bestD = Infinity;
    points.forEach((p, i) => { const d = Math.abs(x(p.date) - px); if (d < bestD) { bestD = d; best = i; } });
    setHover(best);
  }

  const focus = hover === null ? points[points.length - 1] : points[hover];
  // Callout pill near the focused point, clamped inside the viewBox.
  const pillW = 46, pillH = 20;
  const pillX = Math.min(W - PAD.right - pillW, Math.max(PAD.left, x(focus.date) - pillW / 2));
  const pillY = Math.max(2, y(focus.trend) - pillH - 8);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Body weight with trend line"
      className="block touch-pan-y select-none"
      onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
      <defs>
        <linearGradient id="weight-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.30" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--surface-2)" strokeWidth={1} />
          <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" fontSize={11} fill="var(--muted)">{v}</text>
        </g>
      ))}
      {xTicks.map((d, i) => {
        const isFirst = i === 0;
        const isLast = i === xTicks.length - 1;
        const anchor = xTicks.length === 1 ? "middle" : isFirst ? "start" : isLast ? "end" : "middle";
        return <text key={d} x={x(d)} y={H - 6} textAnchor={anchor} fontSize={10} fill="var(--muted)">{fmtDate(d)}</text>;
      })}
      {area && <path d={area} fill="url(#weight-fill)" />}
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p) => (
        <circle key={p.date} cx={x(p.date)} cy={y(p.weight_lb)} r={3.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={1.5} opacity={0.9} />
      ))}
      {hover !== null && (
        <line x1={x(focus.date)} x2={x(focus.date)} y1={PAD.top} y2={H - PAD.bottom}
          stroke="var(--border)" strokeWidth={1} strokeDasharray="3 3" />
      )}
      <circle cx={x(focus.date)} cy={y(focus.trend)} r={4.5} fill="var(--foreground)" stroke="var(--accent)" strokeWidth={2} />
      <g>
        <rect x={pillX} y={pillY} width={pillW} height={pillH} rx={6}
          fill="var(--surface-2)" stroke="var(--border)" strokeWidth={1} />
        <text x={pillX + pillW / 2} y={pillY + 13.5} textAnchor="middle" fontSize={11} fontWeight={700}
          fill="var(--foreground)">{focus.weight_lb.toFixed(1)}</text>
      </g>
    </svg>
  );
}
