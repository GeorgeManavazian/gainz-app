"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import WeightChart from "@/components/WeightChart";
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
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/** Once-a-day weigh-in entry: quiet row that locks after today's save; Edit reopens for typos. */
function WeighInRowEntry({ todayWeight, lastWeight, onSave }: {
  todayWeight: number | null; lastWeight: number | null; onSave: (w: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const parsed = parseFloat(value);
  const valid = Number.isFinite(parsed) && parsed >= 50 && parsed <= 600;

  async function save() {
    if (!valid) return;
    setSaving(true); setErr("");
    try { await onSave(parsed); setEditing(false); setValue(""); }
    catch { setErr("Couldn't save."); }
    finally { setSaving(false); }
  }

  return (
    <div className="card-grad rounded-3xl border border-border">
      {!editing ? (
        todayWeight === null ? (
          <button type="button" onClick={() => setEditing(true)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-surface-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-accent/40 text-accent" aria-hidden>+</span>
            <span className="flex-1 text-[15px] font-medium">Log today&apos;s weigh-in</span>
            <span className="text-muted">›</span>
          </button>
        ) : (
          <div className="flex w-full items-center gap-3 px-4 py-3.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success/15 text-success" aria-hidden>✓</span>
            <span className="flex-1 text-[15px]">
              Logged today · <span className="font-bold tabular-nums">{todayWeight.toFixed(1)} lb</span>
            </span>
            <button type="button" onClick={() => { setEditing(true); setValue(String(todayWeight)); }}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted active:text-foreground">
              Edit
            </button>
          </div>
        )
      ) : (
        <div className="flex items-center gap-2 px-4 py-3">
          <label className="relative flex-1">
            <input autoFocus inputMode="decimal"
              placeholder={lastWeight === null ? "200.0" : lastWeight.toFixed(1)}
              value={value} onChange={(e) => setValue(e.target.value)}
              aria-label="Today's weight in pounds"
              className="h-11 w-full rounded-xl border border-border bg-surface-2 px-4 pr-9 text-base tabular-nums text-foreground placeholder:text-muted focus:border-accent focus:outline-none" />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">lb</span>
          </label>
          <button type="button" onClick={save} disabled={!valid || saving}
            className="h-11 rounded-xl bg-accent px-4 text-[15px] font-bold text-accent-foreground active:opacity-80 disabled:opacity-40">
            {saving ? "…" : "Save"}
          </button>
          <button type="button" onClick={() => { setEditing(false); setErr(""); }}
            className="h-11 rounded-xl border border-border px-3 text-sm text-muted">
            ✕
          </button>
          {err && <p className="text-xs text-danger">{err}</p>}
        </div>
      )}
    </div>
  );
}

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

  const chip = (r: Range, label: string) => (
    <button key={label} type="button" onClick={() => setRange(r)} aria-pressed={range === r}
      className={`h-7 rounded-full px-3 text-[13px] font-semibold ${range === r ? "bg-accent/20 text-accent" : "text-muted"}`}>
      {label}
    </button>
  );

  const twoWk = slope === null ? null : slope * 2;
  const trendCopy =
    assessment === "on_track" ? "On track for your goal"
    : assessment === "stalled" ? "Stalled — suggestion below"
    : assessment === "too_fast" ? (phase === "cut" ? "Losing faster than planned" : "Gaining faster than planned")
    : "Need a week of weigh-ins";

  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 bg-background px-4 pb-28 pt-6 text-foreground">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent" aria-hidden>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M7 3 V11 M5 3 V7 M9 3 V7 M7 11 V21 M16 3 C14 3 14 8 16 10 V21 M16 10 C18 8 18 3 16 3" />
              </svg>
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Diet</h1>
              <p className="text-[13px] text-muted">Nutrition overview &amp; targets</p>
            </div>
          </div>
          <Link href="/profile" className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-muted active:text-foreground">Targets ›</Link>
        </div>
        {err && <p className="text-sm text-danger">{err}</p>}

        <section className="card-grad rounded-3xl border border-border p-5 pb-3">
          <div className="mb-2 flex items-start justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Weight</p>
              <p className="leading-tight">
                <span className="text-4xl font-bold tabular-nums">{(todayRow?.weight_lb ?? last?.weight_lb)?.toFixed(1) ?? "—"}</span>
                <span className="ml-1 text-sm text-muted">lb</span>
              </p>
              <p className="text-[11px] text-muted">{todayRow ? "Today" : last ? fmtDay(last.date) : ""}</p>
            </div>
            <div className="flex rounded-full border border-border bg-surface-2 p-0.5">
              {chip(30, "1M")}{chip(90, "3M")}{chip("all", "All")}
            </div>
          </div>
          <WeightChart points={visible} />
        </section>

        <section className="card-grad grid grid-cols-2 divide-x divide-border rounded-3xl border border-border">
          <div className="flex items-center gap-3 p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-accent text-accent" aria-hidden>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {twoWk !== null && twoWk > 0 ? <path d="M4 17 L11 10 L14 13 L20 7 M20 12 V7 H15" /> : <path d="M4 7 L11 14 L14 11 L20 17 M20 12 V17 H15" />}
              </svg>
            </span>
            <div>
              <p className="text-[11px] font-medium text-muted">14-Day Trend</p>
              <p className="text-lg font-bold">
                {twoWk === null ? "—" : `${twoWk > 0 ? "Up" : "Down"} ${Math.abs(twoWk).toFixed(1)} lb`}
                {twoWk !== null && <span className="ml-1 text-[11px] font-normal text-muted">vs 2 wk ago</span>}
              </p>
              <p className="text-[11px] text-muted">{trendCopy}</p>
            </div>
          </div>
          <div className="flex flex-col justify-center p-5 text-right">
            <p className="text-[11px] font-medium text-muted">Weekly goal</p>
            <p className="text-lg font-bold tabular-nums text-accent">{phase === "cut" ? "−" : "+"}{rate.toFixed(1)} lb</p>
            <p className="text-[11px] text-muted">Per week</p>
          </div>
        </section>

        <ProgressCard assessment={assessment} slope={slope} rate={rate} phase={phase} delta={delta}
          newKcal={newKcal} suppressed={suppressed} onApply={apply} />

        <WeighInRowEntry todayWeight={todayRow?.weight_lb ?? null} lastWeight={last?.weight_lb ?? null} onSave={save} />

        {/* Last 7 days — bottom, matching the approved render */}
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold">Last 7 days intake</h2>
            <span className="text-[11px] text-muted">kcal</span>
          </div>
          <ul className="card-grad divide-y divide-border overflow-hidden rounded-3xl border border-border text-sm">
            {days.map((d) => (
              <li key={d.date}>
                <button type="button" onClick={() => setOpenDay(openDay === d.date ? null : d.date)}
                  aria-expanded={openDay === d.date}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    targets && d.kcal <= targets.kcal ? "bg-success/15 text-success" : "bg-surface-2 text-muted"}`} aria-hidden>
                    {openDay === d.date ? "▾" : "✓"}
                  </span>
                  <span className="flex-1">
                    <span className="font-semibold">{fmtDay(d.date)}</span>
                    {d.date === today && <span className="ml-2 text-[11px] text-muted">Today</span>}
                  </span>
                  <span className="text-[15px] font-bold tabular-nums text-accent">{Math.round(d.kcal).toLocaleString()}</span>
                  <span className="text-muted">›</span>
                </button>
                <div className="mx-4 mb-2 h-1 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-accent"
                    style={{ width: `${targets ? Math.min(100, Math.round((d.kcal / targets.kcal) * 100)) : 0}%` }} />
                </div>
                {openDay === d.date && d.meals.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 border-t border-border py-2.5 pl-6 pr-4 text-[13px]">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-accent" aria-hidden>
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M4 12 A8 5 0 0 0 20 12 Z" /><path d="M9 8 C9 6 11 6 11 8 M14 8 C14 5 17 5 17 8" />
                      </svg>
                    </span>
                    <span className="flex-1">{m.food_name} <span className="text-muted">· {m.grams}g</span></span>
                    <span className="tabular-nums text-muted">{Math.round(m.calories)} kcal</span>
                  </div>
                ))}
              </li>
            ))}
            {days.length === 0 && <li className="px-4 py-3 text-muted">No meals in the last 7 days</li>}
          </ul>
        </section>

        <section className="card-grad rounded-3xl border border-border p-5">
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
