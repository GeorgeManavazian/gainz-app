"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import { getProfile, upsertProfile } from "@/lib/profile";
import {
  computeTargets, defaultProteinPerLb, defaultRate,
  type Activity, type Phase, type Profile, type Sex,
} from "@/lib/targets";

const ACTIVITIES: { value: Activity; label: string }[] = [
  { value: "sedentary", label: "Sedentary (desk, no training)" },
  { value: "light", label: "Light (1–3 sessions/wk)" },
  { value: "moderate", label: "Moderate (3–5 sessions/wk)" },
  { value: "active", label: "Active (6–7 sessions/wk)" },
  { value: "very", label: "Very active (2×/day or physical job)" },
];

const inputCls = "w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none";
const labelCls = "text-xs font-semibold text-muted";

// Form state is strings so the user can clear a field mid-edit without NaN fights.
type Form = {
  sex: Sex; birth_date: string; height_in: string; weight_lb: string;
  activity: Activity; phase: Phase; rate_lb_per_wk: string;
  protein_g_per_lb: string; tdee_override: string;
};

const EMPTY: Form = {
  sex: "male", birth_date: "", height_in: "", weight_lb: "",
  activity: "moderate", phase: "cut", rate_lb_per_wk: String(defaultRate("cut")),
  protein_g_per_lb: "", tdee_override: "",
};

function toProfile(f: Form): Profile | null {
  const height_in = parseFloat(f.height_in);
  const weight_lb = parseFloat(f.weight_lb);
  const rate = parseFloat(f.rate_lb_per_wk);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.birth_date)) return null;
  if (!(height_in > 0) || !(weight_lb > 0) || !(rate >= 0)) return null;
  const protein = f.protein_g_per_lb === "" ? null : parseFloat(f.protein_g_per_lb);
  if (protein !== null && !(protein >= 0.8 && protein <= 1.5)) return null;
  const tdee = f.tdee_override === "" ? null : parseInt(f.tdee_override, 10);
  if (tdee !== null && !(tdee > 0)) return null;
  return {
    sex: f.sex, birth_date: f.birth_date, height_in, weight_lb,
    activity: f.activity, phase: f.phase, rate_lb_per_wk: rate,
    protein_g_per_lb: protein, tdee_override: tdee,
  };
}

export default function ProfilePage() {
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    getProfile()
      .then((p) => {
        if (p) setForm({
          sex: p.sex, birth_date: p.birth_date, height_in: String(p.height_in),
          weight_lb: String(p.weight_lb), activity: p.activity, phase: p.phase,
          rate_lb_per_wk: String(p.rate_lb_per_wk),
          protein_g_per_lb: p.protein_g_per_lb === null ? "" : String(p.protein_g_per_lb),
          tdee_override: p.tdee_override === null ? "" : String(p.tdee_override),
        });
      })
      .catch(() => setErr("Couldn't load profile."))
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Changing phase resets rate to that phase's default and clears the protein override
  // so the phase default applies. User can re-edit afterwards.
  function changePhase(phase: Phase) {
    setForm((f) => ({ ...f, phase, rate_lb_per_wk: String(defaultRate(phase)), protein_g_per_lb: "" }));
  }

  const profile = useMemo(() => toProfile(form), [form]);
  const targets = useMemo(() => (profile ? computeTargets(profile) : null), [profile]);

  async function save() {
    if (!profile) return;
    setSaving(true); setErr("");
    try {
      await upsertProfile(profile);
      router.replace("/");
    } catch {
      setErr("Couldn't save. Please try again.");
      setSaving(false);
    }
  }

  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background px-4 pb-10 pt-6 text-foreground">
        <h1 className="text-xl font-bold tracking-tight">Profile &amp; targets</h1>
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Sex</span>
                <select className={inputCls} value={form.sex} onChange={(e) => set("sex")(e.target.value as Sex)}>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Birth date</span>
                <input className={inputCls} type="date" value={form.birth_date}
                  onChange={(e) => set("birth_date")(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Height (in)</span>
                <input className={inputCls} inputMode="decimal" placeholder="74" value={form.height_in}
                  onChange={(e) => set("height_in")(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Weight (lb)</span>
                <input className={inputCls} inputMode="decimal" placeholder="203" value={form.weight_lb}
                  onChange={(e) => set("weight_lb")(e.target.value)} />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className={labelCls}>Activity</span>
              <select className={inputCls} value={form.activity}
                onChange={(e) => set("activity")(e.target.value as Activity)}>
                {ACTIVITIES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </label>

            <div className="flex flex-col gap-1">
              <span className={labelCls}>Phase</span>
              <div className="grid grid-cols-3 gap-2">
                {(["cut", "maintain", "bulk"] as Phase[]).map((ph) => (
                  <button key={ph} type="button" onClick={() => changePhase(ph)}
                    className={`rounded-xl border px-3 py-3 text-sm font-semibold capitalize ${
                      form.phase === ph
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-surface text-foreground active:bg-surface-2"}`}>
                    {ph}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Rate (lb / week)</span>
                <input className={inputCls} inputMode="decimal" value={form.rate_lb_per_wk}
                  disabled={form.phase === "maintain"}
                  onChange={(e) => set("rate_lb_per_wk")(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Protein (g / lb)</span>
                <input className={inputCls} inputMode="decimal"
                  placeholder={`${defaultProteinPerLb(form.phase)} (default)`}
                  value={form.protein_g_per_lb}
                  onChange={(e) => set("protein_g_per_lb")(e.target.value)} />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className={labelCls}>TDEE override (kcal, optional)</span>
              <input className={inputCls} inputMode="numeric" placeholder="Leave blank to use estimate"
                value={form.tdee_override} onChange={(e) => set("tdee_override")(e.target.value)} />
            </label>

            <section className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold text-muted">Daily targets</h2>
              {targets ? (
                <>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {([["kcal", targets.kcal], ["P", targets.protein_g],
                       ["C", targets.carbs_g], ["F", targets.fat_g]] as const).map(([label, v]) => (
                      <div key={label}>
                        <p className="text-xl font-bold tabular-nums leading-none">{v}</p>
                        <p className="mt-1 text-[11px] text-muted">{label}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    TDEE est. {targets.tdee_est}
                    {profile?.tdee_override != null && ` · using override ${targets.tdee}`}
                  </p>
                  {targets.warning && <p className="mt-2 text-sm text-danger">{targets.warning}</p>}
                </>
              ) : (
                <p className="text-sm text-muted">Fill in every field to see targets.</p>
              )}
            </section>

            {err && <p className="text-sm text-danger">{err}</p>}
            <button
              className="rounded-xl bg-accent px-4 py-3.5 text-base font-semibold text-accent-foreground active:opacity-80 disabled:opacity-40"
              disabled={!profile || saving} onClick={save}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
