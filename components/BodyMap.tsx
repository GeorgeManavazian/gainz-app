// components/BodyMap.tsx
"use client";
import { useState } from "react";
import { MUSCLES, muscleName, type Muscle } from "@/lib/muscles";
import type { MuscleWeek } from "@/lib/muscle-week";
import { hitTier, type HitTier } from "@/lib/body-map";

const FILL: Record<HitTier, string> = {
  none: "fill-surface-3",
  once: "fill-warning",
  good: "fill-success",
  over: "fill-danger",
};
const DOT: Record<HitTier, string> = {
  none: "bg-surface-3",
  once: "bg-warning",
  good: "bg-success",
  over: "bg-danger",
};

/** One tappable region. `d` is an SVG path in the shared 200×410 viewBox. */
type Region = { muscle: Muscle; d: string };

// Shapes are written per side as rounded rects/ellipses via path arcs for a flat look.
const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r},${y} h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 -${r},${r} h-${w - 2 * r} a${r},${r} 0 0 1 -${r},-${r} v-${h - 2 * r} a${r},${r} 0 0 1 ${r},-${r} z`;
const ell = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx},${cy} a${rx},${ry} 0 1 0 ${2 * rx},0 a${rx},${ry} 0 1 0 -${2 * rx},0 z`;
// Left-side x → right-side x in a 200-wide figure.
const L = (x: number) => x;
const R = (x: number, w = 0) => 200 - x - w;

// Base silhouette (same for both figures): head, neck, torso, arms, legs.
export const SILHOUETTE = [
  ell(100, 28, 19, 20),                                   // head
  rr(91, 46, 18, 14, 4),                                  // neck
  "M58,60 L142,60 L138,168 L130,212 L70,212 L62,168 Z",   // torso
  rr(34, 64, 22, 78, 10), rr(144, 64, 22, 78, 10),        // upper arms
  rr(30, 140, 20, 76, 9), rr(150, 140, 20, 76, 9),        // forearms
  rr(70, 208, 28, 110, 12), rr(102, 208, 28, 110, 12),    // thighs
  rr(73, 314, 22, 84, 10), rr(105, 314, 22, 84, 10),      // lower legs
];

// Front figure regions. Draw order matters for overlaps (later wins the tap).
export const FRONT: Region[] = [
  { muscle: "upper_chest", d: rr(L(63), 72, 35, 15, 6) + rr(R(63, 35), 72, 35, 15, 6) },
  { muscle: "mid_chest",   d: rr(L(63), 89, 35, 19, 6) + rr(R(63, 35), 89, 35, 19, 6) },
  { muscle: "lower_chest", d: rr(L(65), 110, 31, 8, 4) + rr(R(65, 31), 110, 31, 8, 4) },
  { muscle: "front_delts", d: ell(57, 72, 10, 10) + ell(143, 72, 10, 10) },
  { muscle: "side_delts",  d: ell(43, 80, 9, 11) + ell(157, 80, 9, 11) },
  { muscle: "biceps",      d: rr(L(37), 94, 16, 42, 8) + rr(R(37, 16), 94, 16, 42, 8) },
  { muscle: "forearms",    d: rr(L(33), 146, 14, 62, 7) + rr(R(33, 14), 146, 14, 62, 7) },
  { muscle: "abs",         d: rr(87, 124, 26, 68, 7) },
  { muscle: "quads",       d: rr(L(73), 218, 22, 92, 10) + rr(R(73, 22), 218, 22, 92, 10) },
];

// Back figure regions.
export const BACK: Region[] = [
  { muscle: "traps",       d: "M78,58 L122,58 L112,84 L100,80 L88,84 Z" },
  { muscle: "upper_back",  d: rr(L(63), 80, 33, 32, 8) + rr(R(63, 33), 80, 33, 32, 8) },
  { muscle: "rear_delts",  d: ell(53, 74, 11, 11) + ell(147, 74, 11, 11) },
  { muscle: "lats",        d: "M64,112 L96,112 L94,166 L74,172 Z M136,112 L104,112 L106,166 L126,172 Z" },
  { muscle: "lower_back",  d: rr(84, 150, 32, 42, 8) },
  { muscle: "triceps",     d: rr(L(37), 94, 16, 42, 8) + rr(R(37, 16), 94, 16, 42, 8) },
  { muscle: "glutes",      d: ell(85, 230, 16, 15) + ell(115, 230, 16, 15) },
  { muscle: "hamstrings",  d: rr(L(74), 250, 20, 66, 9) + rr(R(74, 20), 250, 20, 66, 9) },
  { muscle: "calves",      d: rr(L(76), 320, 16, 60, 8) + rr(R(76, 16), 320, 16, 60, 8) },
];

function Figure({ regions, week, selected, onSelect, label }: {
  regions: Region[]; week: MuscleWeek; selected: Muscle | null; onSelect: (m: Muscle) => void; label: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1">
      <svg viewBox="0 0 200 410" className="h-auto w-full max-w-[150px]" aria-label={`${label} view`}>
        {SILHOUETTE.map((d, i) => <path key={i} d={d} className="fill-surface-2 stroke-border" strokeWidth={1} />)}
        {regions.map(({ muscle, d }) => {
          const tier = hitTier(week[muscle].hits);
          const active = selected === muscle;
          return (
            <path key={muscle} d={d} role="button" tabIndex={0}
              aria-label={muscleName(muscle)} aria-pressed={active}
              onClick={() => onSelect(muscle)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(muscle); } }}
              className={`cursor-pointer outline-none ${FILL[tier]} ${active ? "stroke-foreground" : "stroke-background"}`}
              strokeWidth={active ? 2 : 1} />
          );
        })}
      </svg>
      <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
    </div>
  );
}

export default function BodyMap({ week }: { week: MuscleWeek }) {
  const [selected, setSelected] = useState<Muscle | null>(null);
  const toggle = (m: Muscle) => setSelected((s) => (s === m ? null : m));
  const sel = selected ? week[selected] : null;

  return (
    <section className="card-grad rounded-3xl border border-border p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">This week</h2>
        <p className="text-[11px] text-muted">2× per muscle</p>
      </div>

      <div className="mt-3 flex gap-3">
        <Figure regions={FRONT} week={week} selected={selected} onSelect={toggle} label="Front" />
        <Figure regions={BACK} week={week} selected={selected} onSelect={toggle} label="Back" />
      </div>

      <p className="mt-3 min-h-5 text-center text-[13px]" aria-live="polite">
        {selected && sel
          ? <><span className="font-semibold">{muscleName(selected)}</span>
              <span className="text-muted"> · {sel.hits}× this week · {sel.sets} {sel.sets === 1 ? "set" : "sets"}</span></>
          : <span className="text-muted">Tap a muscle</span>}
      </p>

      <div className="mt-2 flex items-center justify-center gap-3 text-[10px] text-muted opacity-60" aria-hidden>
        {([["none", "0"], ["once", "1"], ["good", "2–3"], ["over", "4+"]] as [HitTier, string][]).map(([t, l]) => (
          <span key={t} className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${DOT[t]}`} />{l}
          </span>
        ))}
      </div>
    </section>
  );
}

// Keep the muscle list honest: every fine muscle must be drawn exactly once.
const drawn = new Set([...FRONT, ...BACK].map((r) => r.muscle));
if (process.env.NODE_ENV !== "production") {
  for (const m of MUSCLES) if (!drawn.has(m.id)) console.warn(`gainz body-map: ${m.id} is not drawn`);
}
