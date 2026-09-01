// components/LineChart.tsx
"use client";
import { useMemo } from "react";

const W = 360, PAD = { top: 8, right: 10, bottom: 20, left: 34 };

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function LineChart({ data, height = 140 }: { data: { date: string; value: number }[]; height?: number }) {
  const H = height;
  const geo = useMemo(() => {
    if (data.length === 0) return null;
    const vs = data.map((p) => p.value);
    const lo = Math.floor(Math.min(...vs) - 2), hi = Math.ceil(Math.max(...vs) + 2);
    const x = (i: number) => data.length === 1 ? (PAD.left + W - PAD.right) / 2
      : PAD.left + (i / (data.length - 1)) * (W - PAD.left - PAD.right);
    const y = (v: number) => PAD.top + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - PAD.top - PAD.bottom);
    const path = data.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
    const tickCount = Math.min(4, data.length);
    const ticks = Array.from({ length: tickCount }, (_, i) => Math.round((i / Math.max(1, tickCount - 1)) * (data.length - 1)));
    return { x, y, path, lo, hi, ticks };
  }, [data, H]);
  if (!geo) return <p className="py-8 text-center text-sm text-muted">No sessions yet</p>;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="e1RM over sessions" className="block">
      {[geo.lo, geo.hi].map((v) => (
        <text key={v} x={PAD.left - 6} y={geo.y(v) + 4} textAnchor="end" className="fill-muted" fontSize="10">{v}</text>
      ))}
      <path d={geo.path} fill="none" strokeWidth="2" className="stroke-accent" />
      {data.map((p, i) => <circle key={p.date + i} cx={geo.x(i)} cy={geo.y(p.value)} r="3" className="fill-accent" />)}
      {geo.ticks.map((i) => (
        <text key={i} x={geo.x(i)} y={H - 4} textAnchor="middle" className="fill-muted" fontSize="10">{fmtDate(data[i].date)}</text>
      ))}
    </svg>
  );
}
