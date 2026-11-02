// components/MealTimeline.tsx
"use client";
import { feedings, type Plan, type TimingMeal, type TimingWorkout } from "@/lib/meal-timing";

/** Today from wake to bed: feedings (food rows within 60 min merged) as dots sized by kcal, the workout as a block, the next window shaded, a now marker. */
export default function MealTimeline({ wake, bed, now, meals, workout, plan }: {
  wake: Date; bed: Date; now: Date; meals: TimingMeal[]; workout: TimingWorkout | null; plan: Plan | null;
}) {
  const W = 360, H = 44, PAD = 6;
  const t0 = wake.getTime(), t1 = bed.getTime();
  const x = (t: number) => PAD + Math.max(0, Math.min(1, (t - t0) / Math.max(1, t1 - t0))) * (W - 2 * PAD);
  const fmt = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric" }).toLowerCase().replace(" ", "");
  const r = (kcal: number) => (kcal < 300 ? 4 : kcal <= 700 ? 6 : 8);
  const win = plan && plan.kind !== "done" && plan.end.getTime() > plan.start.getTime() ? plan : null;
  const wStart = workout ? new Date(workout.started_at).getTime() : null;
  const wEnd = workout ? (workout.ended_at ? new Date(workout.ended_at).getTime() : now.getTime()) : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Today's meal timeline" className="block">
      {/* track */}
      <line x1={PAD} x2={W - PAD} y1={22} y2={22} stroke="var(--border)" strokeWidth={2} strokeLinecap="round" />
      {/* next window */}
      {win && <rect x={x(win.start.getTime())} y={14} width={Math.max(4, x(win.end.getTime()) - x(win.start.getTime()))} height={16} rx={4}
        fill="var(--accent)" fillOpacity={win.kind === "closed" ? 0.08 : 0.22} />}
      {/* workout block */}
      {wStart !== null && wEnd !== null && <rect x={x(wStart)} y={17} width={Math.max(3, x(wEnd) - x(wStart))} height={10} rx={3}
        fill="var(--success)" fillOpacity={0.55} />}
      {/* feedings */}
      {feedings(meals).map((f, i) => (
        <circle key={f.at + i} cx={x(new Date(f.at).getTime())} cy={22} r={r(f.calories)}
          fill="var(--accent)" stroke="var(--surface)" strokeWidth={1.5} />
      ))}
      {/* now */}
      <line x1={x(now.getTime())} x2={x(now.getTime())} y1={8} y2={36} stroke="var(--foreground)" strokeWidth={1.5} />
      {/* ends */}
      <text x={PAD} y={H - 2} fontSize={10} fill="var(--muted)">{fmt(wake)}</text>
      <text x={W - PAD} y={H - 2} fontSize={10} fill="var(--muted)" textAnchor="end">{fmt(bed)}</text>
    </svg>
  );
}
