import { MUSCLES, muscleName } from "@/lib/muscles";
import type { MuscleWeek } from "@/lib/muscle-week";

type Week = { weekStart: string; week: MuscleWeek };

function fmtDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function WeeklyMuscles({ weeks }: { weeks: Week[] }) {
  if (weeks.length === 0) return null;
  const current = weeks[0].week;
  const past = weeks.slice(1, 4).reverse(); // oldest -> newest

  return (
    <section className="card-grad rounded-3xl border border-border p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">This week</h2>
        <p className="text-[11px] text-muted">2× per muscle</p>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1.5 text-[13px]">
        <span className="text-[11px] text-muted">Muscle</span>
        <span className="text-right text-[11px] text-muted">Hits</span>
        <span className="text-right text-[11px] text-muted">Sets</span>
        {MUSCLES.map((m) => {
          const { hits, sets } = current[m.id];
          const targeted = m.target !== null;
          const met = targeted && hits >= m.target!;
          const rowTone = targeted ? "" : "text-muted";
          const hitsTone = met ? "text-success" : "";
          return (
            <div key={m.id} className="contents">
              <span className={rowTone}>{muscleName(m.id)}</span>
              <span className={`tabular-nums text-right ${rowTone} ${hitsTone}`}>
                {targeted ? `${met ? "✓ " : ""}${hits}/${m.target}` : hits}
              </span>
              <span className={`tabular-nums text-right ${rowTone}`}>{sets}</span>
            </div>
          );
        })}
      </div>

      {past.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">Last 3 weeks</p>
          <div className="flex flex-col gap-1.5">
            {MUSCLES.map((m) => (
              <div key={m.id} className="flex items-center justify-between">
                <span className="text-[12px] text-muted">{muscleName(m.id)}</span>
                <div className="flex gap-1.5">
                  {past.map((w) => {
                    const hits = w.week[m.id].hits;
                    const cls = m.target === null
                      ? "border border-border"
                      : hits >= m.target
                        ? "bg-accent"
                        : "border border-accent/40";
                    return (
                      <span key={w.weekStart} className={`h-3 w-3 rounded-sm ${cls}`}
                        title={`${fmtDay(w.weekStart)} · ${hits} ${hits === 1 ? "hit" : "hits"}`} />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
