// components/BodyMap.tsx
"use client";
import { useMemo, useState } from "react";
import { muscleName } from "@/lib/muscles";
import type { MuscleWeek } from "@/lib/muscle-week";
import { hitTier, partHits, partSets, type HitTier } from "@/lib/body-map";
import { PART_LABEL, PART_MUSCLES, SHAPES, type BodyPart } from "@/lib/body-shapes";

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

function Figure({ view, week, selected, onSelect }: {
  view: "front" | "back"; week: MuscleWeek; selected: BodyPart | null; onSelect: (p: BodyPart) => void;
}) {
  // Paint the selected part last so its highlight stroke is never covered by a neighbour.
  const shapes = SHAPES.filter((s) => s.view === view).sort((a, b) => (a.part === selected ? 1 : 0) - (b.part === selected ? 1 : 0));
  return (
    <div className="flex flex-1 flex-col items-center gap-1">
      <svg viewBox="0 0 100 220" role="group" aria-label={`${view} view`} className="h-auto w-full max-w-[160px]">
        {shapes.map((s) => {
          const hits = partHits(s.part, week);
          const neutral = hits === null;
          const active = !neutral && selected === s.part;
          const fill = neutral ? "fill-surface-2" : FILL[hitTier(hits)];
          return (
            <g key={s.part}
              role={neutral ? undefined : "button"} tabIndex={neutral ? undefined : 0}
              aria-label={neutral ? undefined : PART_LABEL[s.part]} aria-pressed={neutral ? undefined : active}
              onClick={neutral ? undefined : () => onSelect(s.part)}
              onKeyDown={neutral ? undefined : (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(s.part); } }}
              className={`${neutral ? "" : "cursor-pointer"} ${fill} ${active ? "stroke-foreground [stroke-width:1.2]" : "stroke-background [stroke-width:0.5]"} focus-visible:stroke-foreground focus-visible:[stroke-width:1.2] focus:outline-none`}>
              {s.points.map((pts, i) => <polygon key={i} points={pts} />)}
            </g>
          );
        })}
      </svg>
      <span className="text-[10px] uppercase tracking-wider text-muted">{view}</span>
    </div>
  );
}

export default function BodyMap({ week }: { week: MuscleWeek }) {
  const [selected, setSelected] = useState<BodyPart | null>(null);
  const toggle = (p: BodyPart) => setSelected((s) => (s === p ? null : p));
  const detail = useMemo(() => {
    if (!selected) return null;
    const muscles = PART_MUSCLES[selected];
    return {
      label: PART_LABEL[selected],
      hits: partHits(selected, week) ?? 0,
      sets: partSets(selected, week),
      breakdown: muscles.length > 1 ? muscles.map((m) => `${muscleName(m)} ${week[m].hits}×`).join(" · ") : null,
    };
  }, [selected, week]);

  return (
    <section className="card-grad rounded-3xl border border-border p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">This week</h2>
        <p className="text-[11px] text-muted">2× per muscle</p>
      </div>

      <div className="mt-3 flex gap-4">
        <Figure view="front" week={week} selected={selected} onSelect={toggle} />
        <Figure view="back" week={week} selected={selected} onSelect={toggle} />
      </div>

      <div className="mt-3 min-h-10 text-center text-[13px]" aria-live="polite">
        {detail ? (
          <>
            <p><span className="font-semibold">{detail.label}</span>
              <span className="text-muted"> · {detail.hits}× this week · {detail.sets} {detail.sets === 1 ? "set" : "sets"}</span></p>
            {detail.breakdown && <p className="text-[11px] text-muted">{detail.breakdown}</p>}
          </>
        ) : <p className="text-muted">Tap a muscle</p>}
      </div>

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
