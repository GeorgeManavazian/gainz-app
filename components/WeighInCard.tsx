"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

const fmtSlope = (s: number) => `${s > 0 ? "+" : "−"}${Math.abs(s).toFixed(1)} lb/wk`;

export default function WeighInCard({ todayWeight, lastWeight, trend, slope, onSave, linkToDetail = false }: {
  todayWeight: number | null; lastWeight: number | null; trend: number | null; slope: number | null;
  onSave: (weight_lb: number) => Promise<void>; linkToDetail?: boolean;
}) {
  const [value, setValue] = useState(todayWeight === null ? "" : String(todayWeight));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { setValue(todayWeight === null ? "" : String(todayWeight)); }, [todayWeight]);

  const parsed = parseFloat(value);
  const valid = Number.isFinite(parsed) && parsed > 0;

  async function save() {
    if (!valid) return;
    setSaving(true); setErr("");
    try { await onSave(parsed); }
    catch { setErr("Couldn't save."); }
    finally { setSaving(false); }
  }

  const hero = (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted">Today&apos;s weigh-in</p>
      <p className="leading-none">
        <span className="text-[52px] font-bold tabular-nums text-foreground">{todayWeight === null ? "—" : todayWeight.toFixed(1)}</span>
        <span className="ml-1.5 text-base text-muted">lb</span>
      </p>
      <p className="text-[13px] text-muted">
        trend <span className="font-semibold text-foreground tabular-nums">{trend === null ? "—" : trend.toFixed(1)}</span>
        {slope !== null && <> · <span className="font-bold text-accent tabular-nums">{fmtSlope(slope)}</span></>}
      </p>
    </div>
  );

  return (
    <section className="flex items-stretch justify-between gap-4 rounded-2xl border border-border bg-surface p-5">
      {linkToDetail ? <Link href="/weight" className="active:opacity-80">{hero}</Link> : hero}
      <div className="flex w-[45%] flex-col justify-center gap-2">
        <label className="relative">
          <input className="h-11 w-full rounded-xl border border-border bg-surface-2 px-4 pr-9 text-base tabular-nums text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            inputMode="decimal" placeholder={lastWeight === null ? "203.0" : lastWeight.toFixed(1)}
            value={value} onChange={(e) => setValue(e.target.value)} aria-label="Today's weight in pounds" />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">lb</span>
        </label>
        <button type="button" onClick={save} disabled={!valid || saving}
          className="h-10 rounded-xl bg-accent px-4 text-[15px] font-bold text-accent-foreground active:opacity-80 disabled:opacity-40">
          {saving ? "Saving…" : "Save"}
        </button>
        {err && <p className="text-xs text-danger">{err}</p>}
      </div>
    </section>
  );
}
