"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import { MUSCLE_GROUPS, PRESETS, muscleLabel, muscleShort, type MuscleGroup } from "@/lib/exercises";
import { getActiveWorkout, startWorkout } from "@/lib/workouts-db";

const sameSet = (a: MuscleGroup[], b: MuscleGroup[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

export default function NewWorkout() {
  const router = useRouter();
  const [selected, setSelected] = useState<MuscleGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    getActiveWorkout().then((w) => { if (w) router.replace(`/workout/${w.id}`); }).catch(() => {});
  }, [router]);

  function toggle(id: MuscleGroup) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function start() {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    try {
      const ordered = MUSCLE_GROUPS.map((m) => m.id).filter((id) => selected.includes(id));
      const w = await startWorkout(ordered);
      router.replace(`/workout/${w.id}`);
    } catch {
      setErr("Couldn't start. Please try again.");
      setBusy(false);
    }
  }

  const presetActive = (p: "upper" | "lower") => sameSet(selected, PRESETS[p]);

  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background px-4 pb-28 pt-6 text-foreground">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-2xl leading-none text-accent">‹</Link>
          <h1 className="text-xl font-bold tracking-tight">New workout</h1>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">Quick presets</h2>
          <div className="grid grid-cols-2 gap-3">
            {(["upper", "lower"] as const).map((p) => (
              <button key={p} type="button" onClick={() => setSelected(PRESETS[p])}
                className={`rounded-2xl border bg-surface p-4 text-left active:bg-surface-2 ${
                  presetActive(p) ? "border-accent" : "border-border"}`}>
                <p className="text-lg font-bold">{p === "upper" ? "Upper" : "Lower"}</p>
                <p className="text-[13px] text-muted">{PRESETS[p].map(muscleLabel).join(", ")}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">Choose targets</h2>
          <p className="-mt-1 text-[13px] text-muted">Select one or more muscle groups.</p>
          {MUSCLE_GROUPS.map((m) => {
            const on = selected.includes(m.id);
            return (
              <button key={m.id} type="button" onClick={() => toggle(m.id)}
                className={`flex items-center gap-3 rounded-2xl border bg-surface px-4 py-3.5 text-left active:bg-surface-2 ${
                  on ? "border-accent/60" : "border-border"}`}>
                <span className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs ${
                  on ? "border-accent bg-accent/20 text-accent" : "border-border"}`}>{on ? "✓" : ""}</span>
                <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-surface-2 text-[11px] font-semibold text-muted">
                  {muscleShort(m.id)}
                </span>
                <span className="text-lg font-semibold">{m.label}</span>
              </button>
            );
          })}
        </section>

        <div className="rounded-2xl border border-border bg-surface px-4 py-3">
          <p className="text-base">{selected.length} target{selected.length === 1 ? "" : "s"} selected</p>
          <p className="text-[13px] text-muted">
            {selected.length ? MUSCLE_GROUPS.filter((m) => selected.includes(m.id)).map((m) => m.label).join(", ") : "Nothing yet"}
          </p>
        </div>
        {err && <p className="text-sm text-danger">{err}</p>}

        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md bg-gradient-to-t from-background via-background px-4 pb-6 pt-3">
          <button type="button" onClick={start} disabled={selected.length === 0 || busy}
            className="w-full rounded-xl bg-accent py-4 text-lg font-bold text-accent-foreground active:opacity-80 disabled:opacity-40">
            ▶ Start workout
          </button>
        </div>
      </main>
    </AuthGuard>
  );
}
