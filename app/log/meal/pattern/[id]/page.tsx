"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import { deletePattern, getPattern, markUsed } from "@/lib/patterns-db";
import { scaleItem, totals, type PatternRow } from "@/lib/patterns";
import { logMeal } from "@/lib/log";

type Row = { key: number; food_name: string; grams: string };   // grams as typed

const FlameIcon = () => (
  <svg viewBox="0 0 256 256" className="h-6 w-6 shrink-0 text-accent" fill="currentColor" aria-hidden>
    <path d="M143.38,17.85a8,8,0,0,0-12.63,3.41l-22,60.41L84.59,58.26a8,8,0,0,0-11.93.89C51,87.53,40,116.08,40,144a88,88,0,0,0,176,0C216,84.55,165.21,36,143.38,17.85Zm40.51,135.49a57.6,57.6,0,0,1-46.56,46.55A7.65,7.65,0,0,1,136,200a8,8,0,0,1-1.32-15.89c16.57-2.79,30.63-16.85,33.44-33.45a8,8,0,0,1,15.78,2.68Z" />
  </svg>
);

export default function PatternReview() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [pattern, setPattern] = useState<PatternRow | null | "missing" | "error" | undefined>(undefined);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const loggedCountRef = useRef(0);   // total rows logged in this session of taps, across retries

  useEffect(() => {
    getPattern(id).then((p) => {
      if (!p) return setPattern("missing");
      setPattern(p);
      setRows(p.items.map((it, i) => ({ key: i, food_name: it.food_name, grams: String(it.grams) })));
    }).catch(() => setPattern("error"));
  }, [id]);

  const entries = useMemo(() => {
    if (!pattern || pattern === "missing" || pattern === "error") return [];
    return rows.map((r) => {
      const g = parseFloat(r.grams) || 0;
      return { row: r, grams: g, entry: scaleItem(pattern.items[r.key], g) };
    });
  }, [pattern, rows]);
  const sum = totals(entries.map((e) => e.entry));
  const canLog = entries.length > 0 && entries.every((e) => e.grams > 0) && !busy;

  async function logAll() {
    if (!canLog || !pattern || pattern === "missing" || pattern === "error") return;
    setBusy(true); setErr("");
    for (const e of entries) {                                  // in order; queue keeps FIFO
      try {
        await logMeal(e.entry);
      } catch {
        // Row not yet sent (and everything after it) stays on screen so a retry only re-sends the remainder.
        setErr(`Couldn't log ${e.row.food_name} — it was rejected. Remove it with ✕ and log the rest.`);
        setBusy(false);
        return;
      }
      loggedCountRef.current += 1;
      setRows((rs) => rs.filter((r) => r.key !== e.row.key));
    }
    markUsed(pattern).catch(() => { /* ordering only */ });
    router.replace(`/?logged=${loggedCountRef.current}`);
  }

  async function remove() {
    if (!pattern || pattern === "missing" || pattern === "error") return;
    if (!window.confirm(`Delete "${pattern.name}"? Today's logged meals are not affected.`)) return;
    try { await deletePattern(pattern.id); router.replace("/log/meal"); }
    catch { setErr("Couldn't delete. Try again."); }
  }

  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background px-4 pb-10 pt-6 text-foreground">
        <div className="flex items-center gap-3">
          <Link href="/log/meal" aria-label="Back"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-accent active:bg-surface-2">←</Link>
          <div>
            <h1 className="text-2xl font-bold leading-tight">{pattern && pattern !== "missing" && pattern !== "error" ? pattern.name : "Saved meal"}</h1>
            <p className="text-sm text-muted">Log saved meal</p>
          </div>
        </div>

        {pattern === undefined && <p className="text-sm text-muted">Loading…</p>}
        {pattern === "missing" && (
          <p className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
            This meal was deleted. <Link href="/log/meal" className="text-accent">Back to Log meal</Link>
          </p>
        )}
        {pattern === "error" && (
          <p className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
            Couldn&apos;t load this meal. Check your connection. <Link href="/log/meal" className="text-accent">Back to Log meal</Link>
          </p>
        )}

        {pattern && pattern !== "missing" && pattern !== "error" && (
          <>
            <ul className="card-grad divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {entries.map(({ row, entry }) => (
                <li key={row.key} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-foreground">{row.food_name}</span>
                    <span className="mt-0.5 block text-[12px] tabular-nums text-muted">
                      {Math.round(entry.calories)} kcal · {Math.round(entry.protein_g)} P
                    </span>
                  </span>
                  <label className="flex h-11 w-[104px] shrink-0 items-center justify-end gap-1 rounded-xl border border-border bg-surface px-3 focus-within:border-accent">
                    <input inputMode="decimal" value={row.grams} aria-label={`${row.food_name} grams`}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => setRows((rs) => rs.map((r) => r.key === row.key ? { ...r, grams: e.target.value } : r))}
                      className="w-full bg-transparent text-right text-xl font-bold tabular-nums text-accent focus:outline-none" />
                    <span className="text-sm text-muted">g</span>
                  </label>
                  <button type="button" aria-label={`Remove ${row.food_name}`}
                    onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                    className="flex h-10 w-10 shrink-0 items-center justify-center text-lg text-accent/80 active:text-accent">×</button>
                </li>
              ))}
              {entries.length === 0 && <li className="px-4 py-3 text-sm text-muted">Nothing left to log.</li>}
            </ul>

            <div className="card-grad flex items-center justify-center gap-3 rounded-2xl border border-border px-4 py-3.5">
              <FlameIcon />
              {([["kcal", sum.kcal], ["P", sum.protein_g], ["C", sum.carbs_g], ["F", sum.fat_g]] as const).map(([l, v], i) => (
                <span key={l} className="flex items-center gap-3">
                  {i > 0 && <span className="text-lg text-muted">·</span>}
                  <span className="text-center">
                    <span className="block text-2xl font-bold tabular-nums text-accent">{v}</span>
                    <span className="text-[12px] text-muted">{l}</span>
                  </span>
                </span>
              ))}
            </div>

            {err && <p className="text-sm text-danger">{err}</p>}
            <button type="button" onClick={logAll} disabled={!canLog}
              className="w-full rounded-2xl bg-accent px-4 py-4 text-lg font-semibold text-accent-foreground active:opacity-80 disabled:opacity-40">
              {busy ? "Logging…" : "Log all"}
            </button>
            <button type="button" onClick={remove} className="py-2 text-sm text-muted active:text-foreground">Delete meal</button>
          </>
        )}
      </main>
    </AuthGuard>
  );
}
