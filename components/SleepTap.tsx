// components/SleepTap.tsx
"use client";
import { useState } from "react";
import { SLEEP_LABELS } from "@/lib/sleep";

/** "How did you sleep?" — five taps, saved immediately; shows the pick, tap again to change. */
export default function SleepTap({ value, onSave }: { value: number | null; onSave: (q: number) => Promise<void> }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState("");
  async function pick(q: number) {
    if (busy !== null) return;
    setBusy(q); setErr("");
    try { await onSave(q); } catch { setErr("Couldn't save."); } finally { setBusy(null); }
  }
  return (
    <section className="rounded-2xl border border-border bg-surface px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[13px] font-semibold">How did you sleep?</span>
        <span className="text-[11px] text-muted">{value ? SLEEP_LABELS[value - 1] : "tap one"}</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Last night's sleep">
        {[1, 2, 3, 4, 5].map((q) => {
          const on = value === q;
          return (
            <button key={q} type="button" role="radio" aria-checked={on} aria-label={`${q} — ${SLEEP_LABELS[q - 1]}`}
              onClick={() => pick(q)} disabled={busy !== null}
              className={`h-10 rounded-xl text-[15px] font-bold tabular-nums ${on ? "bg-accent text-accent-foreground" : "border border-border text-muted active:bg-surface-2"} disabled:opacity-60`}>
              {busy === q ? "…" : q}
            </button>
          );
        })}
      </div>
      {err && <p className="mt-1 text-xs text-danger">{err}</p>}
    </section>
  );
}
