// components/NewExerciseSheet.tsx
"use client";
import { useEffect, useState } from "react";
import { MUSCLE_GROUPS, REGION_DEFAULT, muscleName, musclesIn, type Muscle, type MuscleGroup } from "@/lib/muscles";

const CHIP = "h-7 shrink-0 rounded-full px-3 text-[13px] font-semibold";
const CHIP_ON = "bg-accent/20 text-accent";
const CHIP_OFF = "border border-border text-muted";
const ROW = "flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
const LABEL = "text-[11px] font-medium uppercase tracking-wider text-muted";

export default function NewExerciseSheet({ initialName, groups, onSave, onClose }: {
  initialName: string; groups: MuscleGroup[];
  onSave: (name: string, primary: Muscle[]) => Promise<void>; onClose: () => void;
}) {
  const startRegion: MuscleGroup = groups[0] ?? "chest";
  const [name, setName] = useState(initialName);
  const [region, setRegion] = useState<MuscleGroup>(startRegion);
  const [picked, setPicked] = useState<Muscle[]>([REGION_DEFAULT[startRegion]]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const regionOrder = [
    ...MUSCLE_GROUPS.filter((m) => groups.includes(m.id)),
    ...MUSCLE_GROUPS.filter((m) => !groups.includes(m.id)),
  ];
  const trimmed = name.trim();
  const canSave = !busy && trimmed.length > 0 && picked.length > 0;

  function pickRegion(r: MuscleGroup) {
    setRegion(r);
    setPicked([REGION_DEFAULT[r]]);
  }

  function toggle(m: Muscle) {
    setPicked((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));
  }

  async function save() {
    if (!canSave) return;
    setBusy(true); setErr("");
    try { await onSave(trimmed, picked); } catch { setErr("Couldn't save. Please try again."); } finally { setBusy(false); }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-10 bg-black/60" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="new-exercise-title"
        className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md rounded-t-3xl border-t border-border bg-surface px-4 pb-6 pt-3 shadow-2xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        <div className="flex items-start gap-3">
          <h2 id="new-exercise-title" className="flex-1 text-[22px] font-bold leading-tight">New exercise</h2>
          <button type="button" onClick={onClose} className="rounded-xl border border-border px-3 py-1.5 text-sm text-muted">Close</button>
        </div>

        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Exercise name" autoFocus
          aria-label="Exercise name"
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          className="mt-4 w-full rounded-2xl border border-border bg-background px-4 py-3 text-base placeholder:text-muted focus:border-accent focus:outline-none" />

        <h3 className={`${LABEL} mt-4 mb-2`}>Region</h3>
        <div className={ROW}>
          {regionOrder.map((m) => (
            <button key={m.id} type="button" onClick={() => pickRegion(m.id)} aria-pressed={region === m.id}
              className={`${CHIP} ${region === m.id ? CHIP_ON : CHIP_OFF}`}>
              {m.label}
            </button>
          ))}
        </div>

        <h3 className={`${LABEL} mt-3 mb-2`}>Muscle</h3>
        <div className={ROW}>
          {musclesIn(region).map((m) => (
            <button key={m} type="button" onClick={() => toggle(m)} aria-pressed={picked.includes(m)}
              className={`${CHIP} ${picked.includes(m) ? CHIP_ON : CHIP_OFF}`}>
              {muscleName(m)}
            </button>
          ))}
        </div>

        <button type="button" onClick={save} disabled={!canSave}
          className="mt-4 w-full rounded-xl bg-accent py-4 text-lg font-bold text-accent-foreground active:opacity-80 disabled:opacity-60">
          Save exercise
        </button>
        {err && <p className="mt-2 text-sm text-danger">{err}</p>}
      </div>
    </>
  );
}
