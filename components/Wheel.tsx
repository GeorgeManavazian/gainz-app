// components/Wheel.tsx
"use client";
import { useEffect, useRef } from "react";

const ITEM = 40;      // px per row
const VIEW = 160;     // px viewport height (h-40)
const PAD = (VIEW - ITEM) / 2; // 60px top/bottom so first/last can sit in the band

export function range(from: number, to: number, step = 1): number[] {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

export default function Wheel({ label, values, value, onChange, format = String }: {
  label: string; values: number[]; value: number; onChange: (v: number) => void; format?: (v: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<number | null>(null);
  const lastEmitted = useRef<number>(value);

  // Scroll to the external value when it changes (preset / reopen).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, values.indexOf(value));
    if (Math.round(el.scrollTop / ITEM) !== idx) el.scrollTo({ top: idx * ITEM });
    lastEmitted.current = value;
  }, [value, values]);

  function settle() {
    const el = ref.current;
    if (!el) return;
    const idx = Math.min(values.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM)));
    const v = values[idx];
    if (v !== lastEmitted.current) { lastEmitted.current = v; onChange(v); }
  }

  function onScroll() {
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(settle, 120); // fallback for browsers without scrollend
  }

  return (
    <div className="flex flex-col items-center">
      <span className="mb-1 text-center text-[11px] uppercase tracking-wider text-muted">{label}</span>
      <div className="relative h-40 w-[92px]">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[60px] h-10 rounded-xl border border-border bg-surface-2" />
        <div ref={ref} onScroll={onScroll} onScrollEnd={settle}
          className="relative h-full snap-y snap-mandatory overflow-y-scroll [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ paddingTop: PAD, paddingBottom: PAD }}>
          {values.map((v) => (
            <div key={v} className={`flex h-10 snap-center items-center justify-center tabular-nums ${
              v === value ? "text-[22px] font-bold text-accent" : "text-lg text-muted"}`}>
              {format(v)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
