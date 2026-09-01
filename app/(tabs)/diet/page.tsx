"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import WeightChart from "@/components/WeightChart";
import WeighInCard from "@/components/WeighInCard";
import ProgressCard from "@/components/ProgressCard";
import { supabase } from "@/lib/supabase";
import { getProfile, applyAdjustment, type ProfileRow } from "@/lib/profile";
import { computeTargets } from "@/lib/targets";
import { deleteWeighIn, listWeighIns, localDateKey, upsertWeighIn, type WeighInRow } from "@/lib/weighins";
import { addDays, assessProgress, emaTrend, inCooldown, slopeLbPerWk, suggestAdjustment, trendWeight, type Assessment } from "@/lib/trend";

type Range = 30 | 90 | "all";
type MealRow = { id: string; food_name: string; grams: number; calories: number; protein_g: number };
type DayMeals = { date: string; kcal: number; protein: number; meals: MealRow[] };

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

export default function DietPage() {
  const [rows, setRows] = useState<WeighInRow[]>([]);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [range, setRange] = useState<Range>(30);
  const [err, setErr] = useState("");
  const [days, setDays] = useState<DayMeals[]>([]);
  const [openDay, setOpenDay] = useState<string | null>(localDateKey());

  const load = useCallback(async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);
    const [w, p, m] = await Promise.allSettled([
      listWeighIns(),
      getProfile(),
      supabase.from("meals").select("*").gte("logged_at", start.toISOString()).order("logged_at"),
    ]);
    if (w.status === "fulfilled") { setRows(w.value); setErr(""); }
    else { setErr("Couldn't load weigh-ins."); }
    setProfile(p.status === "fulfilled" ? p.value : null);

    if (m.status === "fulfilled" && !m.value.error) {
      const rowsByDay = new Map<string, DayMeals>();
      for (const raw of (m.value.data ?? []) as (MealRow & { logged_at: string })[]) {
        const key = localDateKey(new Date(raw.logged_at));
        const entry = rowsByDay.get(key) ?? { date: key, kcal: 0, protein: 0, meals: [] };
        entry.kcal += Number(raw.calories);
        entry.protein += Number(raw.protein_g);
        entry.meals.push({ id: raw.id, food_name: raw.food_name, grams: raw.grams, calories: raw.calories, protein_g: raw.protein_g });
        rowsByDay.set(key, entry);
      }
      setDays([...rowsByDay.values()].sort((a, b) => (a.date < b.date ? 1 : -1)));
    }
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
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background px-4 pb-28 pt-6 text-foreground">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Diet</h1>
          <Link href="/profile" className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-muted active:text-foreground">Targets ›</Link>
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

        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">Meals · last 7 days</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface text-sm">
            {days.map((d) => (
              <li key={d.date}>
                <button type="button" onClick={() => setOpenDay(openDay === d.date ? null : d.date)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2">
                  <span className="flex-1 font-medium">{fmtDay(d.date)}</span>
                  <span className="tabular-nums text-muted">{Math.round(d.kcal).toLocaleString()} kcal · {Math.round(d.protein)} P</span>
                  <span className="text-muted">{openDay === d.date ? "▾" : "›"}</span>
                </button>
                <div className="mx-4 mb-2 h-1 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-accent"
                    style={{ width: `${targets ? Math.min(100, Math.round((d.kcal / targets.kcal) * 100)) : 0}%` }} />
                </div>
                {openDay === d.date && d.meals.map((m) => (
                  <div key={m.id} className="flex justify-between border-t border-border py-2 pl-10 pr-4 text-[13px]">
                    <span>{m.food_name} · {m.grams}g</span>
                    <span className="tabular-nums text-muted">{Math.round(m.calories)} kcal</span>
                  </div>
                ))}
              </li>
            ))}
            {days.length === 0 && <li className="px-4 py-3 text-muted">No meals in the last 7 days</li>}
          </ul>
        </section>
      </main>
    </AuthGuard>
  );
}
