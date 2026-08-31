"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import WeightChart from "@/components/WeightChart";
import WeighInCard from "@/components/WeighInCard";
import ProgressCard from "@/components/ProgressCard";
import { getProfile, applyAdjustment, type ProfileRow } from "@/lib/profile";
import { computeTargets } from "@/lib/targets";
import { deleteWeighIn, listWeighIns, localDateKey, upsertWeighIn, type WeighInRow } from "@/lib/weighins";
import { addDays, assessProgress, emaTrend, inCooldown, slopeLbPerWk, suggestAdjustment, trendWeight, type Assessment } from "@/lib/trend";

type Range = 30 | 90 | "all";

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function WeightPage() {
  const [rows, setRows] = useState<WeighInRow[]>([]);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [range, setRange] = useState<Range>(30);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const [w, p] = await Promise.allSettled([listWeighIns(), getProfile()]);
    if (w.status === "fulfilled") { setRows(w.value); setErr(""); }
    else { setErr("Couldn't load weigh-ins."); }
    setProfile(p.status === "fulfilled" ? p.value : null);
  }, []);
  useEffect(() => { load(); }, [load]);

  const today = localDateKey();
  const trended = useMemo(() => emaTrend(rows), [rows]);
  const visible = useMemo(() => {
    if (range === "all") return trended;
    const since = addDays(today, -(range - 1));
    return trended.filter((p) => p.date >= since);
  }, [trended, range, today]);

  const todayRow = rows.find((r) => r.date === today) ?? null;
  const last = rows.length ? rows[rows.length - 1] : null;
  const trend = trendWeight(rows);
  const slope = slopeLbPerWk(rows, today);
  const phase = profile?.phase ?? "cut";
  const rate = profile?.rate_lb_per_wk ?? 0;
  const assessment: Assessment = profile ? assessProgress(slope, phase, rate) : "insufficient_data";
  const delta = suggestAdjustment(slope, phase, rate);
  const targets = profile ? computeTargets({ ...profile, weight_lb: trend ?? profile.weight_lb }) : null;
  const newKcal = targets ? (phase === "cut" ? targets.kcal - delta : targets.kcal + delta) : null;
  const suppressed = inCooldown(profile?.last_adjusted_at ?? null, new Date());

  async function save(weight_lb: number) { await upsertWeighIn(today, weight_lb); await load(); }
  async function remove(id: string) {
    try { await deleteWeighIn(id); await load(); }
    catch { setErr("Couldn't delete weigh-in."); }
  }
  async function apply() {
    if (!profile || !targets) return;
    const base = profile.tdee_override ?? targets.tdee_est;
    await applyAdjustment(profile, phase === "cut" ? base - delta : base + delta);
    await load();
  }

  const tab = (r: Range, label: string) => (
    <button key={label} type="button" onClick={() => setRange(r)}
      className={`h-7 rounded-md px-4 text-sm font-semibold ${range === r ? "bg-background text-accent" : "text-muted"}`}>
      {label}
    </button>
  );

  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background px-4 pb-10 pt-6 text-foreground">
        <div className="grid grid-cols-3 items-center">
          <Link href="/" className="text-sm font-medium text-accent active:opacity-80">‹ Back</Link>
          <h1 className="text-center text-xl font-bold tracking-tight">Weight</h1>
          <span />
        </div>
        {err && <p className="text-sm text-danger">{err}</p>}

        <WeighInCard todayWeight={todayRow?.weight_lb ?? null} lastWeight={last?.weight_lb ?? null}
          trend={trend} slope={slope} onSave={save} />

        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
          <div className="inline-flex self-start rounded-lg border border-border bg-surface-2 p-0.5">
            {tab(30, "30")}{tab(90, "90")}{tab("all", "All")}
          </div>
          <WeightChart points={visible} />
          <ProgressCard assessment={assessment} slope={slope} rate={rate} phase={phase} delta={delta}
            newKcal={newKcal} suppressed={suppressed} onApply={apply} />
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted">Recent weigh-ins</p>
          <ul className="divide-y divide-border">
            {[...rows].reverse().slice(0, 30).map((r) => (
              <li key={r.id} className="flex items-center justify-between py-3 text-[13px] font-medium">
                <span className="text-foreground">{fmtDate(r.date)}</span>
                <span className="flex items-center gap-4">
                  <span className="tabular-nums text-foreground">{r.weight_lb.toFixed(1)} <span className="text-muted">lb</span></span>
                  <button type="button" onClick={() => remove(r.id)} aria-label={`Delete ${fmtDate(r.date)}`}
                    className="text-muted active:text-danger">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6" />
                    </svg>
                  </button>
                </span>
              </li>
            ))}
            {rows.length === 0 && <li className="py-3 text-[13px] text-muted">Nothing yet — log this morning&apos;s weight above.</li>}
          </ul>
        </section>
      </main>
    </AuthGuard>
  );
}
