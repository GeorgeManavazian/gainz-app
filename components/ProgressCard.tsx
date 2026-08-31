"use client";
import { useState } from "react";
import type { Assessment } from "@/lib/trend";

type Phase = "cut" | "maintain" | "bulk";

export default function ProgressCard({ assessment, slope, rate, phase, delta, newKcal, suppressed, onApply }: {
  assessment: Assessment; slope: number | null; rate: number; phase: Phase; delta: number;
  newKcal: number | null; suppressed: boolean; onApply: () => Promise<void>;
}) {
  const [applying, setApplying] = useState(false);
  const [err, setErr] = useState("");
  if (slope === null) return null;
  if (assessment === "stalled" && suppressed) return null;
  if (assessment !== "stalled" && assessment !== "too_fast") return null;

  const goal = phase === "cut" ? `−${rate}` : `+${rate}`;
  const fmt = (s: number) => { const a = Math.abs(s); const sign = a < 0.05 ? "" : s > 0 ? "+" : "−"; return `${sign}${a.toFixed(1)}`; };

  async function apply() {
    setApplying(true); setErr("");
    try { await onApply(); } catch { setErr("Couldn't apply."); } finally { setApplying(false); }
  }

  const stalled = assessment === "stalled";
  const title = stalled ? "Trend flat 14 days" : `${phase === "cut" ? "Losing" : "Gaining"} ${Math.abs(slope).toFixed(1)} lb/wk`;
  const line1 = stalled ? `(${fmt(slope)} lb/wk, goal ${goal}).` : `Faster than ${(rate + 0.75).toFixed(2)} lb/wk.`;
  const line2 = stalled
    ? `${phase === "cut" ? "Drop" : "Add"} ${delta} kcal → ${newKcal ?? "—"}?`
    : `Consider ${phase === "cut" ? "adding" : "cutting"} 100–200 kcal.`;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-surface-2 p-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-accent text-accent" aria-hidden>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {stalled ? <path d="M3 12 L21 12" /> : <path d="M3 6 L10 14 L14 10 L21 18" />}
        </svg>
      </div>
      <div className="flex-1 text-[13px]">
        <p className="font-bold text-foreground">{title}</p>
        <p className="text-muted">{line1}</p>
        <p className="text-muted">{line2}</p>
        {err && <p className="mt-1 text-xs text-danger">{err}</p>}
      </div>
      {stalled && (
        <button type="button" onClick={apply} disabled={applying}
          className="h-9 shrink-0 rounded-lg bg-accent px-5 text-sm font-bold text-accent-foreground active:opacity-80 disabled:opacity-40">
          {applying ? "…" : "Apply"}
        </button>
      )}
    </div>
  );
}
