// components/MuscleStrip.tsx
"use client";
import { useState } from "react";
import { muscleName, type Muscle } from "@/lib/muscles";

export type StripChip = { muscle: Muscle; hits: number; target: number };

const BASE = "h-7 shrink-0 rounded-full px-3 text-[13px] font-semibold";
const ON = "bg-accent/20 text-accent";
const OFF = "border border-border text-muted active:text-foreground";

export default function MuscleStrip({ inRegion, other, active, onPick }: {
  inRegion: StripChip[];
  other: StripChip[];
  active: Muscle | null;
  onPick: (m: Muscle | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (inRegion.length === 0 && other.length === 0) return null;
  const chips = expanded ? [...inRegion, ...other] : inRegion;

  return (
    <div role="group" aria-label="Behind this week"
      className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {active !== null && (
        <button type="button" onClick={() => onPick(null)} className={`${BASE} ${OFF}`}>All</button>
      )}
      {chips.map((c) => {
        const on = c.muscle === active;
        return (
          <button key={c.muscle} type="button" aria-pressed={on}
            onClick={() => onPick(on ? null : c.muscle)}
            className={`${BASE} ${on ? ON : OFF}`}>
            {muscleName(c.muscle)} {c.hits}/{c.target}
          </button>
        );
      })}
      {other.length > 0 && (
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}
          className={`${BASE} border border-border text-muted/70 active:text-foreground`}>
          {expanded ? "Less" : `+${other.length} more`}
        </button>
      )}
    </div>
  );
}
