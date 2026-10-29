"use client";
import { useEffect, useMemo, useState } from "react";
import { dayDiff, type TrendPoint } from "@/lib/trend";
import { dateTicks, yScale } from "@/lib/chart-axes";

const W = 360, H = 230;
const PAD = { top: 30, right: 10, bottom: 22, left: 40 };
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
    const first = points[0].date, last = points[points.length - 1].date;
    const spanDays = Math.max(1, dayDiff(first, last));
    const plotW = W - PAD.left - PAD.right;
    const ws = points.flatMap((p) => [p.weight_lb, p.trend]);
    const { min: yMin, max: yMax, step } = yScale(Math.min(...ws) - 0.4, Math.max(...ws) + 0.4);
    const x = (d: string) => points.length === 1 ? PAD.left + plotW / 2 : PAD.left + (dayDiff(first, d) / spanDays) * plotW;
    const y = (v: number) => PAD.top + (1 - (v - yMin) / Math.max(step, yMax - yMin)) * (H - PAD.top - PAD.bottom);
    const yTicks: number[] = [];
    for (let v = yMin; v <= yMax + 1e-9; v += step) yTicks.push(v);
    const xTicks = points.length === 1 ? [first] : dateTicks(first, last, plotW / spanDays);
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
  const fx = x(focus.date), fy = y(focus.trend);
  // Tooltip: "Oct 25 · 202.1 lb", clamped inside the plot, pointer under it.
  const label = `${fmtDate(focus.date)} · ${focus.weight_lb.toFixed(1)} lb`;
  const pillW = Math.round(label.length * 6.2) + 16, pillH = 22;
  const pillX = Math.min(W - PAD.right - pillW, Math.max(PAD.left, fx - pillW / 2));
  const pillY = Math.max(2, Math.min(fy, y(focus.weight_lb)) - pillH - 10);
  const arrowX = Math.min(pillX + pillW - 9, Math.max(pillX + 9, fx)); // keep the pointer inside the rounded pill

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Body weight: daily weigh-ins with trend line"
      className="block touch-pan-y select-none"
      onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
      <defs>
        <linearGradient id="weight-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* gridlines + y labels */}
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} opacity={0.5} />
          <text x={PAD.left - 8} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--muted)"
            style={{ fontVariantNumeric: "tabular-nums" }}>{v} lb</text>
        </g>
      ))}

      {/* x labels */}
      {xTicks.map((d, i) => {
        const anchor = xTicks.length === 1 ? "middle" : i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle";
        return <text key={d} x={x(d)} y={H - 6} textAnchor={anchor} fontSize={10} fill="var(--muted)">{fmtDate(d)}</text>;
      })}

      {/* area wash + trend line */}
      {area && <path d={area} fill="url(#weight-fill)" />}
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      {/* raw weigh-ins: quiet dots with a surface ring */}
      {points.map((p) => (
        <circle key={p.date} cx={x(p.date)} cy={y(p.weight_lb)} r={3}
          fill="var(--accent)" fillOpacity={0.7} stroke="var(--surface)" strokeWidth={1.5} />
      ))}

      {/* crosshair + focus marker */}
      <line x1={fx} x2={fx} y1={pillY + pillH + 4} y2={H - PAD.bottom}
        stroke="var(--muted)" strokeWidth={1} strokeDasharray="2 3" opacity={0.6} />
      <circle cx={fx} cy={y(focus.weight_lb)} r={3.2} fill="var(--accent)" stroke="var(--surface)" strokeWidth={1.5} />
      <circle cx={fx} cy={fy} r={4.5} fill="var(--foreground)" stroke="var(--accent)" strokeWidth={2} />

      {/* tooltip */}
      <g>
        <rect x={pillX} y={pillY} width={pillW} height={pillH} rx={7}
          fill="var(--surface-2)" stroke="var(--border)" strokeWidth={1} />
        <path d={`M${arrowX - 4},${pillY + pillH} L${arrowX},${pillY + pillH + 4} L${arrowX + 4},${pillY + pillH} Z`}
          fill="var(--surface-2)" stroke="none" />
        <text x={pillX + pillW / 2} y={pillY + 14.5} textAnchor="middle" fontSize={11} fontWeight={600}
          fill="var(--foreground)" style={{ fontVariantNumeric: "tabular-nums" }}>{label}</text>
      </g>
    </svg>
  );
}
