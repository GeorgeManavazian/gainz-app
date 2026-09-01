"use client";
import { useMemo } from "react";

const W = 360, PAD = { top: 12, right: 8, bottom: 20, left: 30 };

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C${(p1.x + (p2.x - p0.x) / 6).toFixed(1)},${(p1.y + (p2.y - p0.y) / 6).toFixed(1)} ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)},${(p2.y - (p3.y - p1.y) / 6).toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

export default function LineChart({ data, height = 150, unit = "lb" }: {
  data: { date: string; value: number }[]; height?: number; unit?: string;
}) {
  const H = height;
  const geo = useMemo(() => {
    if (data.length === 0) return null;
    const vs = data.map((p) => p.value);
    const lo = Math.floor(Math.min(...vs) - 2), hi = Math.ceil(Math.max(...vs) + 2);
    const x = (i: number) => data.length === 1 ? (PAD.left + W - PAD.right) / 2
      : PAD.left + (i / (data.length - 1)) * (W - PAD.left - PAD.right);
    const y = (v: number) => PAD.top + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - PAD.top - PAD.bottom);
    const pts = data.map((p, i) => ({ x: x(i), y: y(p.value) }));
    const line = smoothPath(pts);
    const baseline = H - PAD.bottom;
    const area = data.length > 1
      ? `${line} L${pts[pts.length - 1].x.toFixed(1)},${baseline} L${pts[0].x.toFixed(1)},${baseline} Z`
      : "";
    const tickCount = Math.min(4, data.length);
    const ticks = Array.from({ length: tickCount }, (_, i) => Math.round((i / Math.max(1, tickCount - 1)) * (data.length - 1)));
    return { x, y, line, area, lo, hi, ticks };
  }, [data, H]);
  if (!geo) return <p className="py-8 text-center text-sm text-muted">No sessions yet</p>;

  const last = data[data.length - 1];
  const pillW = 74, pillH = 30;
  const pillX = Math.min(W - PAD.right - pillW, Math.max(PAD.left, geo.x(data.length - 1) - pillW + 8));
  const pillY = Math.max(2, geo.y(last.value) - pillH - 8);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`e1RM over sessions`} className="block">
      <defs>
        <linearGradient id="line-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.45" />
          <stop offset="0.55" stopColor="var(--accent)" stopOpacity="0.16" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.03" />
        </linearGradient>
      </defs>
      {[geo.lo, geo.hi].map((v) => (
        <text key={v} x={PAD.left - 6} y={geo.y(v) + 4} textAnchor="end" className="fill-muted" fontSize="10">{v}</text>
      ))}
      {geo.area && <path d={geo.area} fill="url(#line-fill)" />}
      <path d={geo.line} fill="none" strokeWidth="2" className="stroke-accent" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((p, i) => <circle key={p.date + i} cx={geo.x(i)} cy={geo.y(p.value)} r="3" className="fill-accent" />)}
      <circle cx={geo.x(data.length - 1)} cy={geo.y(last.value)} r="4.5" fill="var(--foreground)" stroke="var(--accent)" strokeWidth="2" />
      <g>
        <rect x={pillX} y={pillY} width={pillW} height={pillH} rx={8}
          fill="var(--surface-2)" stroke="var(--border)" strokeWidth={1} />
        <text x={pillX + pillW / 2} y={pillY + 13} textAnchor="middle" fontSize="11" fontWeight={700}
          fill="var(--foreground)">{Math.round(last.value)} {unit}</text>
        <text x={pillX + pillW / 2} y={pillY + 25} textAnchor="middle" fontSize="9"
          fill="var(--muted)">{fmtDate(last.date)}</text>
      </g>
      {geo.ticks.map((i) => (
        <text key={i} x={geo.x(i)} y={H - 4} textAnchor="middle" className="fill-muted" fontSize="10">{fmtDate(data[i].date)}</text>
      ))}
    </svg>
  );
}
