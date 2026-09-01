// lib/workouts-db.ts
import { supabase } from "@/lib/supabase";
import { enqueueOrSend, readQueue } from "@/lib/queue";
import type { MuscleGroup } from "@/lib/exercises";
import type { LiftRow, WorkoutRow } from "@/lib/workouts";

const cacheKey = (id: string) => `gainz-workout-${id}`;
const ACTIVE_KEY = "gainz-active-workout";

export function cacheWorkout(w: WorkoutRow): void {
  try { sessionStorage.setItem(cacheKey(w.id), JSON.stringify(w)); } catch { /* private mode etc. */ }
}

function readCache(id: string): WorkoutRow | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(id));
    return raw ? (JSON.parse(raw) as WorkoutRow) : null;
  } catch { return null; }
}

function setActivePointer(id: string): void {
  try { localStorage.setItem(ACTIVE_KEY, id); } catch { /* ignore */ }
}

function clearActivePointer(id: string): void {
  try { if (localStorage.getItem(ACTIVE_KEY) === id) localStorage.removeItem(ACTIVE_KEY); } catch { /* ignore */ }
}

function toWorkout(r: Record<string, unknown>): WorkoutRow {
  return { id: String(r.id), started_at: new Date(String(r.started_at)).toISOString(),
    ended_at: r.ended_at == null ? null : new Date(String(r.ended_at)).toISOString(),
    muscle_groups: (r.muscle_groups as MuscleGroup[]) ?? [] };
}

function toLift(r: Record<string, unknown>): LiftRow {
  return { id: String(r.id), exercise: String(r.exercise), sets: Number(r.sets), reps: Number(r.reps),
    weight: Number(r.weight), logged_at: new Date(String(r.logged_at)).toISOString(),
    workout_id: r.workout_id == null ? null : String(r.workout_id) };
}

export async function startWorkout(groups: MuscleGroup[]): Promise<WorkoutRow> {
  const w: WorkoutRow = { id: crypto.randomUUID(), started_at: new Date().toISOString(),
    ended_at: null, muscle_groups: groups };
  cacheWorkout(w);
  setActivePointer(w.id);
  await enqueueOrSend("workouts", { started_at: w.started_at, muscle_groups: groups }, { id: w.id });
  return w;
}

export async function endWorkout(id: string): Promise<string> {
  const ended_at = new Date().toISOString();
  const cached = readCache(id);
  if (cached) cacheWorkout({ ...cached, ended_at });
  clearActivePointer(id);
  await enqueueOrSend("workouts", { ended_at }, { id, op: "update" });
  return ended_at;
}

export async function deleteWorkout(id: string): Promise<void> {
  try { sessionStorage.removeItem(cacheKey(id)); } catch { /* ignore */ }
  clearActivePointer(id);
  const { error } = await supabase.from("workouts").delete().eq("id", id);
  if (error) throw error;
}

export async function getActiveWorkout(): Promise<WorkoutRow | null> {
  try {
    const { data, error } = await supabase.from("workouts").select("*").is("ended_at", null)
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (data) return toWorkout(data);
    try { localStorage.removeItem(ACTIVE_KEY); } catch { /* ignore */ }
    return null;
  } catch (e) {
    console.warn("gainz workouts: getActiveWorkout server read failed", e);
    let id: string | null = null;
    try { id = localStorage.getItem(ACTIVE_KEY); } catch { /* ignore */ }
    return id ? (readCache(id) ?? null) : null;
  }
}

export async function getWorkout(id: string): Promise<WorkoutRow | null> {
  const cached = readCache(id);
  if (cached) return cached;
  const { data, error } = await supabase.from("workouts").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const w = toWorkout(data);
  cacheWorkout(w);
  return w;
}

export async function listLiftsForWorkout(id: string): Promise<LiftRow[]> {
  const queued = (await readQueue())
    .filter((q) => q.table === "lifts" && q.op === "insert" && q.entry.workout_id === id)
    .map((q) => toLift({ ...q.entry, id: q.id, logged_at: q.queued_at, workout_id: id }));

  let server: LiftRow[] = [];
  try {
    const { data, error } = await supabase.from("lifts").select("*").eq("workout_id", id).order("logged_at");
    if (error) throw error;
    server = (data ?? []).map(toLift);
  } catch (e) {
    console.warn("gainz workouts: server read failed, showing queued sets only", e);
  }

  const byId = new Map<string, LiftRow>();
  for (const r of queued) byId.set(r.id, r);
  for (const r of server) byId.set(r.id, r); // server row wins on id collision
  return [...byId.values()].sort((a, b) => (a.logged_at < b.logged_at ? -1 : a.logged_at > b.logged_at ? 1 : 0));
}

export async function listRecentLifts(limit = 400): Promise<LiftRow[]> {
  const { data, error } = await supabase.from("lifts").select("*")
    .order("logged_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map(toLift);
}

export async function logSet(e: { workout_id: string; exercise: string; sets: number; reps: number; weight: number }): Promise<LiftRow> {
  const id = crypto.randomUUID();
  const logged_at = new Date().toISOString();
  await enqueueOrSend("lifts", { ...e }, { id });
  return { id, ...e, logged_at };
}
