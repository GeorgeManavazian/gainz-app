// components/Ring.tsx
"use client";
import { ringFractions } from "@/lib/hub";

const SWEEP = 0.75; // 270° gauge, gap centred at the bottom

/** Open-gauge progress ring. Track in `border`, fill in `accent` (glow), overage lap in `danger`. */
export default function Ring({ size, stroke, value, target, children }: {
  size: number; stroke: number; value: number; target: number; children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const track = c * SWEEP;
  const { fill, over } = ringFractions(value, target);
  // Rotate so the gauge starts at 135° (bottom-left) and sweeps 270° clockwise to bottom-right.
  const common = { cx: size / 2, cy: size / 2, r, fill: "none", strokeWidth: stroke, strokeLinecap: "round" as const };
  const arc = (frac: number) => ({ strokeDasharray: `${track * frac} ${c}`, style: { transition: "stroke-dasharray 300ms ease" } });
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="block" aria-hidden>
        <g transform={`rotate(135 ${size / 2} ${size / 2})`}>
          <circle {...common} className="stroke-border" strokeDasharray={`${track} ${c}`} />
          {fill > 0 && (
            <circle {...common} className="stroke-accent" {...arc(fill)}
              style={{ ...arc(fill).style, filter: "drop-shadow(0 0 6px var(--accent))" }} />
          )}
          {over > 0 && (
            <circle {...common} className="stroke-danger" {...arc(over)}
              style={{ ...arc(over).style, filter: "drop-shadow(0 0 6px var(--danger))" }} />
          )}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
