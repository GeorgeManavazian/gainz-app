"use client";
import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { supabase } from "@/lib/supabase";
import { logLift } from "@/lib/log";

export default function LogLift() {
  const [exercise, setExercise] = useState("");
  const [sets, setSets] = useState("");
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.from("lifts").select("exercise").order("logged_at", { ascending: false })
      .limit(200).then(({ data }) => {
        setHistory([...new Set((data ?? []).map((r) => r.exercise))]);
      });
  }, []);

  const suggestions = exercise.length > 0
    ? history.filter((h) => h.toLowerCase().includes(exercise.toLowerCase()) && h !== exercise)
    : [];

  async function save() {
    const s = parseInt(sets), r = parseInt(reps), w = parseFloat(weight);
    if (!exercise || !(s > 0) || !(r > 0) || isNaN(w)) return;
    try {
      await logLift({ exercise, sets: s, reps: r, weight: w, notes: notes || undefined });
      setErr("");
      setSets(""); setReps(""); setWeight(""); setNotes(""); setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setErr("Couldn't save. Please try again.");
    }
  }

  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background px-4 pb-10 pt-6 text-foreground">
        <h1 className="text-xl font-bold tracking-tight">Log lift</h1>
        {saved && (
          <p className="rounded-xl border border-success/30 bg-success/10 px-4 py-2.5 text-sm font-medium text-success">
            Logged ✓
          </p>
        )}
        <div className="flex flex-col gap-4">
          <input
            className="rounded-xl border border-border bg-surface px-4 py-3.5 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            placeholder="Exercise"
            value={exercise} onChange={(e) => setExercise(e.target.value)} />
          {suggestions.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {suggestions.slice(0, 5).map((s) => (
                <li key={s}>
                  <button
                    className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-foreground active:bg-surface-2"
                    onClick={() => setExercise(s)}>{s}</button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-3">
            <input
              className="w-1/3 rounded-xl border border-border bg-surface px-3 py-3.5 text-center text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              inputMode="numeric" placeholder="Sets"
              value={sets} onChange={(e) => setSets(e.target.value)} />
            <input
              className="w-1/3 rounded-xl border border-border bg-surface px-3 py-3.5 text-center text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              inputMode="numeric" placeholder="Reps"
              value={reps} onChange={(e) => setReps(e.target.value)} />
            <input
              className="w-1/3 rounded-xl border border-border bg-surface px-3 py-3.5 text-center text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              inputMode="decimal" placeholder="Lbs"
              value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
          <input
            className="rounded-xl border border-border bg-surface px-4 py-3.5 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            placeholder="Notes (optional)"
            value={notes} onChange={(e) => setNotes(e.target.value)} />
          {err && <p className="text-sm text-danger">{err}</p>}
          <button
            className="rounded-xl bg-accent px-4 py-3.5 text-base font-semibold text-accent-foreground active:opacity-80"
            onClick={save}>Save</button>
        </div>
      </main>
    </AuthGuard>
  );
}
