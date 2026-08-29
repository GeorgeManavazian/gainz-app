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
    await logLift({ exercise, sets: s, reps: r, weight: w, notes: notes || undefined });
    setSets(""); setReps(""); setWeight(""); setNotes(""); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <AuthGuard>
      <main className="mx-auto max-w-md p-4">
        <h1 className="mb-3 text-xl font-bold">Log lift</h1>
        {saved && <p className="mb-2 text-green-600">Logged ✓</p>}
        <div className="flex flex-col gap-3">
          <input className="rounded border p-3" placeholder="Exercise"
            value={exercise} onChange={(e) => setExercise(e.target.value)} />
          {suggestions.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {suggestions.slice(0, 5).map((s) => (
                <li key={s}>
                  <button className="rounded-full border px-3 py-1 text-sm"
                    onClick={() => setExercise(s)}>{s}</button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input className="w-1/3 rounded border p-3" inputMode="numeric" placeholder="sets"
              value={sets} onChange={(e) => setSets(e.target.value)} />
            <input className="w-1/3 rounded border p-3" inputMode="numeric" placeholder="reps"
              value={reps} onChange={(e) => setReps(e.target.value)} />
            <input className="w-1/3 rounded border p-3" inputMode="decimal" placeholder="lbs"
              value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
          <input className="rounded border p-3" placeholder="notes (optional)"
            value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button className="rounded bg-black p-3 text-white" onClick={save}>Save</button>
        </div>
      </main>
    </AuthGuard>
  );
}
