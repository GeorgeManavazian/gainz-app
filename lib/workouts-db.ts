// lib/workouts-db.ts
import { supabase } from "@/lib/supabase";
import { enqueueOrSend } from "@/lib/queue";
import type { MuscleGroup } from "@/lib/exercises";
import type { LiftRow, WorkoutRow } from "@/lib/workouts";

const cacheKey = (id: string) => `gainz-workout-${id}`;

export function cacheWorkout(w: WorkoutRow): void {
  try { sessionStorage.setItem(cacheKey(w.id), JSON.stringify(w)); } catch { /* private mode etc. */ }
}

function readCache(id: string): WorkoutRow | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(id));
    return raw ? (JSON.parse(raw) as WorkoutRow) : null;
  } catch { return null; }
}

function toWorkout(r: Record<string, unknown>): WorkoutRow {
  return { id: String(r.id), started_at: String(r.started_at),
    ended_at: r.ended_at == null ? null : String(r.ended_at),
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
  await enqueueOrSend("workouts", { started_at: w.started_at, muscle_groups: groups }, { id: w.id });
  return w;
}

export async function endWorkout(id: string): Promise<string> {
  const ended_at = new Date().toISOString();
  const cached = readCache(id);
  if (cached) cacheWorkout({ ...cached, ended_at });
  await enqueueOrSend("workouts", { ended_at }, { id, op: "update" });
  return ended_at;
}

export async function deleteWorkout(id: string): Promise<void> {
  try { sessionStorage.removeItem(cacheKey(id)); } catch { /* ignore */ }
  const { error } = await supabase.from("workouts").delete().eq("id", id);
  if (error) throw error;
}

export async function getActiveWorkout(): Promise<WorkoutRow | null> {
  const { data, error } = await supabase.from("workouts").select("*").is("ended_at", null)
    .order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? toWorkout(data) : null;
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
  const { data, error } = await supabase.from("lifts").select("*").eq("workout_id", id).order("logged_at");
  if (error) throw error;
  return (data ?? []).map(toLift);
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
