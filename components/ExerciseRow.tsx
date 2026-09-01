// components/ExerciseRow.tsx
"use client";
import { muscleShort, type MuscleGroup } from "@/lib/exercises";

export default function ExerciseRow({ name, muscle, setCount, onClick }: {
  name: string; muscle?: MuscleGroup; setCount: number; onClick: () => void;
}) {
  const active = setCount > 0;
  return (
    <button type="button" onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-surface-2">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-[11px] font-semibold text-muted">
        {muscleShort(muscle)}
      </span>
      <span className={`flex-1 text-[17px] font-medium ${active ? "text-accent" : ""}`}>{name}</span>
      {active && (
        <span className="rounded-md bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
          {setCount} {setCount === 1 ? "set" : "sets"}
        </span>
      )}
      <span className="text-muted">›</span>
    </button>
  );
}
