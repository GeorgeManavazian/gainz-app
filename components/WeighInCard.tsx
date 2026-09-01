"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const fmtSlope = (s: number) => { const a = Math.abs(s); const sign = a < 0.05 ? "" : s > 0 ? "+" : "−"; return `${sign}${a.toFixed(1)} lb/wk`; };

export default function WeighInCard({ todayWeight, lastWeight, trend, slope, onSave, linkToDetail = false, compact = false }: {
  todayWeight: number | null; lastWeight: number | null; trend: number | null; slope: number | null;
  onSave: (weight_lb: number) => Promise<void>; linkToDetail?: boolean; compact?: boolean;
}) {
  const [value, setValue] = useState(todayWeight === null ? "" : String(todayWeight));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement === inputRef.current) return; // user is typing — don't resync
    setValue(todayWeight === null ? "" : String(todayWeight));
  }, [todayWeight]);

  const parsed = parseFloat(value);
  const valid = Number.isFinite(parsed) && parsed >= 50 && parsed <= 600;

  async function save() {
    if (!valid) return;
    setSaving(true); setErr("");
    try { await onSave(parsed); }
    catch { setErr("Couldn't save."); }
    finally { setSaving(false); }
  }

  // Shared input+Save fragment: same state/handlers for both variants, wrapper classes adapt to each layout.
  const inputAndSave = (labelClassName: string, buttonClassName: string) => (
    <>
      <label className={labelClassName}>
        <input ref={inputRef} className="h-11 w-full rounded-xl border border-border bg-surface-2 px-4 pr-9 text-base tabular-nums text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          inputMode="decimal" placeholder={lastWeight === null ? "203.0" : lastWeight.toFixed(1)}
          value={value} onChange={(e) => setValue(e.target.value)} aria-label="Today's weight in pounds" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">lb</span>
      </label>
      <button type="button" onClick={save} disabled={!valid || saving} className={buttonClassName}>
        {saving ? "Saving…" : "Save"}
      </button>
      {err && <p className="text-xs text-danger">{err}</p>}
    </>
  );

  if (compact) {
    return (
      <section className="rounded-2xl border border-border bg-surface">
        <button type="button" onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-accent" aria-hidden>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8 L14 11 H10 Z" /></svg>
          </span>
          {todayWeight === null ? (
            <span className="flex-1 text-base font-medium">Log weigh-in</span>
          ) : (
            <span className="flex-1 text-base">
              <span className="font-bold tabular-nums">{todayWeight.toFixed(1)} lb</span>
              {trend !== null && <span className="text-muted"> · trend {trend.toFixed(1)}</span>}
              {slope !== null && <span className="font-semibold text-accent tabular-nums"> · {fmtSlope(slope)}</span>}
            </span>
          )}
          <span className="text-muted">{open ? "▾" : "›"}</span>
        </button>
        {open && (
          <div className="flex gap-2 border-t border-border p-3">
            {inputAndSave("relative flex-1", "h-11 shrink-0 rounded-xl bg-accent px-4 text-[15px] font-bold text-accent-foreground active:opacity-80 disabled:opacity-40")}
          </div>
        )}
      </section>
    );
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
      {linkToDetail ? <Link href="/diet" className="active:opacity-80">{hero}</Link> : hero}
      <div className="flex w-[45%] flex-col justify-center gap-2">
        {inputAndSave("relative", "h-10 rounded-xl bg-accent px-4 text-[15px] font-bold text-accent-foreground active:opacity-80 disabled:opacity-40")}
      </div>
    </section>
  );
}
