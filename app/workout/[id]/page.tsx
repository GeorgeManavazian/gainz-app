// app/workout/[id]/page.tsx
"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import ExerciseRow from "@/components/ExerciseRow";
import SetSheet, { type SheetState } from "@/components/SetSheet";
import WorkoutSummary from "@/components/WorkoutSummary";
import { MUSCLE_GROUPS, PRESETS, exercisesFor, findExercise, muscleLabel, normalizeName, searchExercises,
  type MuscleGroup } from "@/lib/exercises";
import { formatElapsed, lastSession, recentExercises, type LiftRow, type WorkoutRow } from "@/lib/workouts";
import { deleteWorkout, endWorkout, getWorkout, listLiftsForWorkout, listRecentLifts, logSet } from "@/lib/workouts-db";

const DEFAULT_STATE: SheetState = { sets: 1, reps: 8, weight: 0 };

const sameSet = (a: MuscleGroup[], b: MuscleGroup[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

export default function WorkoutPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [workout, setWorkout] = useState<WorkoutRow | null | undefined>(undefined);
  const [history, setHistory] = useState<LiftRow[]>([]);   // newest-first, all exercises
  const [logged, setLogged] = useState<LiftRow[]>([]);     // this workout, oldest-first
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");
  const [open, setOpen] = useState<string | null>(null);   // exercise name in the sheet
  const [wheel, setWheel] = useState<Record<string, SheetState>>({});
  const [now, setNow] = useState(Date.now());
  const [err, setErr] = useState("");

  useEffect(() => {
    getWorkout(id).then(setWorkout).catch(() => setWorkout(null));
    listRecentLifts().then(setHistory).catch(() => {});
    listLiftsForWorkout(id).then(setLogged).catch(() => {});
  }, [id]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const groups = workout?.muscle_groups ?? [];
  const previousRows = useMemo(() => history.filter((r) => r.workout_id !== id), [history, id]);
  const recents = useMemo(() => recentExercises(previousRows, groups), [previousRows, groups]);
  const setCount = useCallback((name: string) =>
    logged.filter((r) => normalizeName(r.exercise) === normalizeName(name)).reduce((a, r) => a + r.sets, 0), [logged]);

  function openSheet(name: string) {
    if (!wheel[name]) {
      const prev = lastSession(name, previousRows);
      const seed = prev[0] ? { sets: prev[0].sets, reps: prev[0].reps, weight: prev[0].weight } : DEFAULT_STATE;
      setWheel((w) => ({ ...w, [name]: seed }));
    }
    setOpen(name);
  }

  async function addSet() {
    if (!open) return;
    const s = wheel[open] ?? DEFAULT_STATE;
    const row = await logSet({ workout_id: id, exercise: open, sets: s.sets, reps: s.reps, weight: s.weight });
    setLogged((l) => [...l, row]);
  }

  async function complete() {
    try {
      if (logged.length === 0) { await deleteWorkout(id); router.replace("/"); return; }
      const ended_at = await endWorkout(id);
      setWorkout((w) => (w ? { ...w, ended_at } : w));
    } catch { setErr("Couldn't complete. Please try again."); }
  }

  function addCustom() {
    const name = custom.trim();
    if (!name) return;
    setCustom("");
    openSheet(findExercise(name)?.name ?? name);
  }

  if (workout === undefined) return <AuthGuard><main className="min-h-dvh bg-background" /></AuthGuard>;
  if (workout === null) return (
    <AuthGuard>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background px-4 pt-6 text-foreground">
        <p className="text-muted">Workout not found.</p>
        <Link href="/" className="text-accent">Back home</Link>
      </main>
    </AuthGuard>
  );

  if (workout.ended_at) return <AuthGuard><WorkoutSummary workout={workout} logged={logged} history={history} /></AuthGuard>;

  const q = query.trim();
  const searchHits = q ? searchExercises(q) : [];
  const title = sameSet(groups, PRESETS.upper)
    ? "Upper" : sameSet(groups, PRESETS.lower)
    ? "Lower" : groups.map(muscleLabel).join(" · ");
  const openMuscle = open ? findExercise(open)?.muscles[0] : undefined;

  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background px-4 pb-28 pt-6 text-foreground">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-2xl leading-none text-accent">‹</Link>
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          </div>
          <span className="rounded-full border border-accent/40 px-3 py-1.5 text-lg font-semibold tabular-nums text-accent">
            ⏱ {formatElapsed(now - new Date(workout.started_at).getTime())}
          </span>
        </div>

        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search exercises"
          className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base placeholder:text-muted focus:border-accent focus:outline-none" />

        {q ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">Search</h2>
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {searchHits.map((x) => (
                <ExerciseRow key={x.name} name={x.name} muscle={x.muscles[0]} setCount={setCount(x.name)} onClick={() => openSheet(x.name)} />
              ))}
              {searchHits.length === 0 && <p className="px-3 py-3 text-sm text-muted">No matches — add it below.</p>}
            </div>
          </section>
        ) : (
          <>
            {recents.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">Recently used</h2>
                <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                  {recents.map((name) => (
                    <ExerciseRow key={name} name={name} muscle={findExercise(name)?.muscles[0]} setCount={setCount(name)} onClick={() => openSheet(name)} />
                  ))}
                </div>
              </section>
            )}
            {MUSCLE_GROUPS.filter((m) => groups.includes(m.id)).map((m) => (
              <section key={m.id} className="flex flex-col gap-2">
                <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">{m.label}</h2>
                <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                  {exercisesFor([m.id]).slice().sort((a, b) => a.name.localeCompare(b.name)).map((x) => (
                    <ExerciseRow key={x.name} name={x.name} muscle={m.id} setCount={setCount(x.name)} onClick={() => openSheet(x.name)} />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}

        <div className="flex items-center gap-2 rounded-2xl border border-accent/40 bg-surface px-4 py-3">
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Add exercise — type a name"
            onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }}
            className="flex-1 bg-transparent text-base placeholder:text-muted focus:outline-none" />
          <button type="button" onClick={addCustom} className="text-accent">Add ›</button>
        </div>
        {err && <p className="text-sm text-danger">{err}</p>}

        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md bg-gradient-to-t from-background via-background px-4 pb-6 pt-3">
          <button type="button" onClick={complete}
            className="w-full rounded-xl bg-accent py-4 text-lg font-bold text-accent-foreground active:opacity-80">
            ✓ Complete workout
          </button>
        </div>

        {open && (
          <SetSheet exercise={open} muscle={openMuscle}
            previous={lastSession(open, previousRows)}
            logged={logged.filter((r) => normalizeName(r.exercise) === normalizeName(open))}
            state={wheel[open] ?? DEFAULT_STATE}
            onState={(s) => setWheel((w) => ({ ...w, [open]: s }))}
            onAdd={addSet} onClose={() => setOpen(null)} />
        )}
      </main>
    </AuthGuard>
  );
}
