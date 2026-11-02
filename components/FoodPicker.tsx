"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { MealEntry } from "@/lib/log";
import { rankRecentFoods, type MealLike } from "@/lib/food-recents";
import { curatedSearchItems } from "@/lib/foods";
import { deleteMeal } from "@/lib/meals-db";

export type PickedEntry = MealEntry;

type Per100 = { kcal: number; protein: number; carbs: number; fat: number };
type Item = { fdcId: number; name: string; description: string; group: string; badge: "raw" | "cooked" | null; pairable: boolean; per100g: Per100;
  curated?: true; rawLabel?: "Raw" | "Dry"; pair?: { raw: Item | null; cooked: Item | null } };
type Picked = { name: string; description?: string; fdcId?: number; badge?: "raw" | "cooked" | null; pairable?: boolean; rawLabel?: "Raw" | "Dry"; per100g: Per100; fromHistory?: boolean;
  /** Last logged amount, for one-tap re-log and amount-screen prefill. */
  lastGrams?: number; lastCalories?: number };
type Weighing = "raw" | "cooked";
// undefined = still looking, null = USDA has no such version.
type PairCache = Record<Weighing, Item | null | undefined>;
type Unit = { label: string; grams: number };

const BASE_UNITS: Unit[] = [
  { label: "g", grams: 1 },
  { label: "oz", grams: 28.35 },
  { label: "lb", grams: 453.6 },
];

const HISTORY_PREVIEW = 5;

export default function FoodPicker({ onPick, confirmLabel, successLabel, header }: {
  /** Returns the new row id when the pick was logged (enables Undo); void when it was only added to a draft. */
  onPick: (entry: MealEntry) => Promise<string | void> | string | void;
  confirmLabel: string;
  successLabel?: string;
  header?: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [searching, setSearching] = useState(false);
  const [history, setHistory] = useState<Picked[]>([]);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [pairs, setPairs] = useState<PairCache>({ raw: undefined, cooked: undefined });
  const [units, setUnits] = useState<Unit[]>(BASE_UNITS);
  const [unit, setUnit] = useState<Unit>(BASE_UNITS[0]);
  const [amount, setAmount] = useState("");
  const [saved, setSaved] = useState(false);
  const [undo, setUndo] = useState<{ id: string; text: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [err, setErr] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Foods you've logged before, ranked by time-of-day fit + frequency + recency (lib/food-recents).
  useEffect(() => {
    // select("*") — not a named column list — so this stays safe once `unit` lands without a client change.
    supabase.from("meals").select("*")
      .order("logged_at", { ascending: false }).limit(300)
      .then(({ data }) => {
        const ranked = rankRecentFoods((data ?? []) as MealLike[], new Date(), { limit: 30 });
        setHistory(ranked.map((f) => ({ name: f.name, fdcId: f.fdcId, fromHistory: true, per100g: f.per100g,
          lastGrams: f.lastGrams, lastCalories: f.lastCalories })));
      });
  }, []);

  useEffect(() => {
    if (q.length < 2) { setItems([]); setSearching(false); return; }
    clearTimeout(timer.current);
    // Curated table answers instantly (and offline); USDA fills in behind and replaces the list.
    setItems(curatedSearchItems(q));
    setSearching(true);
    let stale = false; // a response for an older query must not overwrite newer results
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/food-search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!stale && Array.isArray(data.items) && data.items.length > 0) setItems(data.items);
      } catch { /* offline or USDA down: keep the curated rows already showing */ }
      if (!stale) setSearching(false);
    }, 300);
    return () => { stale = true; clearTimeout(timer.current); };
  }, [q]);

  const historyHits = useMemo(() => {
    const nq = q.trim().toLowerCase();
    if (nq.length < 2) return showAll ? history : history.slice(0, HISTORY_PREVIEW);
    return history.filter((h) => h.name.toLowerCase().includes(nq)).slice(0, 4);
  }, [history, q, showAll]);

  const weighingOf = (v: { badge?: "raw" | "cooked" | null }): Weighing => (v.badge === "raw" ? "raw" : "cooked");

  async function loadPortions(fdcId: number) {
    setUnits(BASE_UNITS);
    setUnit((u) => (BASE_UNITS.some((b) => b.label === u.label) ? u : BASE_UNITS[0]));
    try {
      const res = await fetch(`/api/food-search?id=${fdcId}`);
      const data = await res.json();
      const extra: Unit[] = (data.portions ?? []).map((p: { label: string; grams: number }) =>
        ({ label: p.label, grams: p.grams }));
      if (extra.length) setUnits([...BASE_UNITS, ...extra]);
    } catch { /* base units are fine */ }
  }

  function toPicked(v: Item): Picked {
    return { name: v.name, description: v.description, fdcId: v.fdcId, badge: v.badge, pairable: v.pairable, rawLabel: v.rawLabel, per100g: v.per100g };
  }

  async function pickItem(v: Item) {
    setErr("");
    setPicked(toPicked(v));
    setAmount("");
    const mine = weighingOf(v);
    const other: Weighing = mine === "raw" ? "cooked" : "raw";
    loadPortions(v.fdcId);
    if (v.pair) { setPairs({ raw: v.pair.raw, cooked: v.pair.cooked }); return; }   // curated: both halves already here
    setPairs({ raw: undefined, cooked: undefined, [mine]: v });
    if (!v.pairable) { setPairs((p) => ({ ...p, [other]: null })); return; }
    // Same food weighed the other way, so the switch is ready by the time you've typed the grams.
    try {
      const res = await fetch(`/api/food-search?pair=${encodeURIComponent(v.name)}&want=${other}`);
      const data = await res.json();
      const hit: Item | null = data.item ?? null;
      setPairs((p) => ({ ...p, [other]: hit && hit.fdcId !== v.fdcId ? hit : null }));
    } catch { setPairs((p) => ({ ...p, [other]: null })); }
  }

  /** Raw ↔ Cooked: swap the USDA item, keep whatever amount is typed. */
  function swapTo(w: Weighing) {
    const t = pairs[w];
    if (!t || !picked || weighingOf(picked) === w) return;
    setPicked(toPicked(t));
    loadPortions(t.fdcId);
  }

  function pickHistory(h: Picked) {
    setErr("");
    setPicked(h);
    setPairs({ raw: null, cooked: null });
    setUnits(BASE_UNITS);
    setUnit(BASE_UNITS[0]);
    setAmount(""); // last amount shows as the placeholder, so typing starts clean
  }

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);

  async function undoLast() {
    if (!undo) return;
    const { id } = undo;
    setUndo(null);
    try { await deleteMeal(id); } catch { setErr("Couldn't undo. Delete it from the Diet tab."); }
  }

  // Show the Raw / Cooked switch while the other version is loading or once it exists; hide if USDA has none.
  const showSwitch = !!picked && !picked.fromHistory && !!picked.pairable &&
    (pairs.raw !== null && pairs.cooked !== null);

  const n = parseFloat(amount) || 0;
  const grams = Math.round(n * unit.grams * 10) / 10;
  const scale = (v: number) => Math.round(v * grams / 100 * 10) / 10;

  async function save() {
    if (!picked || grams <= 0) return;
    setErr("");
    try {
      const id = await onPick({
        food_name: picked.name, grams,
        calories: scale(picked.per100g.kcal), protein_g: scale(picked.per100g.protein),
        carbs_g: scale(picked.per100g.carbs), fat_g: scale(picked.per100g.fat),
        fdc_id: picked.fdcId ? String(picked.fdcId) : undefined,
      });
      const name = picked.name;
      setPicked(null); setQ(""); setAmount("");
      if (typeof id === "string") { setSaved(false); setUndo({ id, text: `Logged ${name} · ${grams} g ✓` }); }
      else if (successLabel) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    } catch {
      setErr("Couldn't save. Please try again.");
    }
  }

  const Badge = ({ badge }: { badge?: "raw" | "cooked" | null }) => badge ? (
    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
      badge === "cooked" ? "bg-success/15 text-success" : "bg-accent/15 text-accent"}`}>
      {badge}
    </span>
  ) : null;

  const Row = ({ name, sub, badge, onClick }: { name: string; sub: string; badge?: "raw" | "cooked" | null; onClick: () => void }) => (
    <li>
      <button className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2" onClick={onClick}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] text-foreground">{name}</span>
          <span className="mt-0.5 block text-[12px] tabular-nums text-muted">{sub}</span>
        </span>
        <Badge badge={badge} />
        <span className="text-muted">›</span>
      </button>
    </li>
  );
  const macroLine = (p: Per100) => `${Math.round(p.kcal)} kcal · ${Math.round(p.protein)} P / 100g`;

  return (
    <>
      {undo && (
        <p className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-2.5 text-sm font-medium text-success" role="status">
          <span className="min-w-0 flex-1 truncate">{undo.text}</span>
          <button type="button" onClick={undoLast} className="shrink-0 rounded-md px-2 py-1 text-[13px] font-semibold text-foreground underline underline-offset-2 active:opacity-80">
            Undo
          </button>
        </p>
      )}
      {saved && !undo && (
        <p className="rounded-xl border border-success/30 bg-success/10 px-4 py-2.5 text-sm font-medium text-success">
          {successLabel}
        </p>
      )}

      {picked ? (
        /* ——— amount screen ——— */
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 text-lg font-semibold leading-snug text-foreground">{picked.name}</p>
            {!showSwitch && <Badge badge={picked.badge} />}
          </div>

          {showSwitch && (
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">Weighing it</h2>
              <div className="flex rounded-full border border-border bg-surface-2 p-0.5" role="group" aria-label="Raw or cooked">
                {(["raw", "cooked"] as const).map((b) => {
                  const on = weighingOf(picked) === b;
                  const loading = pairs[b] === undefined;
                  return (
                    <button key={b} type="button" aria-pressed={on} disabled={loading}
                      onClick={() => swapTo(b)}
                      className={`h-9 flex-1 rounded-full text-[13px] font-semibold capitalize ${
                        on ? "bg-accent/20 text-accent" : "text-muted"} ${loading ? "opacity-50" : ""}`}>
                      {b === "raw" ? (picked.rawLabel ?? "Raw") : "Cooked"}{loading ? " …" : ""}
                    </button>
                  );
                })}
              </div>
              <p className="px-1 text-[12px] text-muted">
                {weighingOf(picked) === "cooked" ? "Weigh it after cooking." : picked.rawLabel === "Dry" ? "Weigh it dry, before cooking." : "Weigh it raw, before cooking."}
                {" "}{Math.round(picked.per100g.kcal)} kcal · {Math.round(picked.per100g.protein)} g protein per 100 g.
                {pairs.raw && pairs.cooked && picked.rawLabel !== "Dry" && pairs.raw.per100g.kcal >= pairs.cooked.per100g.kcal * 0.95
                  ? " Fatty cut: cooking loses fat as well as water, so raw and cooked are about the same per gram." : ""}
              </p>
            </div>
          )}
          {!showSwitch && (
            <p className="rounded-xl bg-surface-2/60 px-3 py-2 text-[12px] leading-snug text-muted">
              {picked.fromHistory ? "From your log: same values as last time you ate this. " : ""}
              {Math.round(picked.per100g.kcal)} kcal and {Math.round(picked.per100g.protein)} g protein per 100 g.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {units.map((u) => (
              <button key={u.label} type="button" onClick={() => setUnit(u)} aria-pressed={unit.label === u.label}
                className={`h-8 rounded-full border px-3 text-[13px] font-semibold ${
                  unit.label === u.label ? "border-accent bg-accent/20 text-accent" : "border-border text-muted active:text-foreground"}`}>
                {u.label}
              </button>
            ))}
          </div>

          <label className="relative">
            <input
              className="w-full rounded-2xl border border-border bg-surface px-4 py-3.5 pr-24 text-2xl font-bold tabular-nums text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              inputMode="decimal" placeholder={picked.lastGrams ? String(picked.lastGrams) : "0"} autoFocus
              value={amount} onChange={(e) => setAmount(e.target.value)} />
            <span className="pointer-events-none absolute right-4 top-1/2 max-w-[40%] -translate-y-1/2 truncate text-sm text-muted">
              {unit.label}{unit.grams !== 1 && n > 0 ? ` = ${grams} g` : ""}
            </span>
          </label>

          <div className="card-grad flex justify-between rounded-2xl border border-border px-4 py-3.5 text-center text-sm">
            <span className="flex-1"><span className="block text-xl font-bold tabular-nums text-accent">{scale(picked.per100g.kcal)}</span><span className="text-muted">kcal</span></span>
            <span className="flex-1"><span className="block text-xl font-bold tabular-nums text-foreground">{scale(picked.per100g.protein)}</span><span className="text-muted">P</span></span>
            <span className="flex-1"><span className="block text-xl font-bold tabular-nums text-foreground">{scale(picked.per100g.carbs)}</span><span className="text-muted">C</span></span>
            <span className="flex-1"><span className="block text-xl font-bold tabular-nums text-foreground">{scale(picked.per100g.fat)}</span><span className="text-muted">F</span></span>
          </div>
          {err && <p className="text-sm text-danger">{err}</p>}
          <div className="flex gap-3">
            <button
              className="flex-1 rounded-xl bg-accent px-4 py-3.5 text-base font-semibold text-accent-foreground active:opacity-80 disabled:opacity-40"
              onClick={save} disabled={grams <= 0}>{confirmLabel}</button>
            <button
              className="rounded-xl border border-border bg-surface px-4 py-3.5 text-base font-semibold text-foreground active:bg-surface-2"
              onClick={() => { setErr(""); setPicked(null); }}>Back</button>
          </div>
        </div>
      ) : (
        /* ——— search ——— */
        <>
          <input
            className="w-full rounded-2xl border border-border bg-surface px-4 py-3.5 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            placeholder="Search food… e.g. grilled chicken breast"
            value={q} onChange={(e) => setQ(e.target.value)} autoFocus />

          {q.trim().length < 2 && header}

          {historyHits.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">Your foods</h2>
                {q.trim().length < 2 && history.length > HISTORY_PREVIEW && (
                  <button type="button" onClick={() => setShowAll((v) => !v)}
                    className="text-[12px] font-semibold text-accent active:opacity-80">
                    {showAll ? "Less" : `All ${history.length} ›`}
                  </button>
                )}
              </div>
              <ul className="card-grad divide-y divide-border overflow-hidden rounded-2xl border border-border">
                {historyHits.map((h) => (
                  <Row key={`h-${h.name}`} name={h.name}
                    sub={h.lastGrams ? `${h.lastGrams} g · ${Math.round(h.lastCalories ?? 0)} kcal` : macroLine(h.per100g)}
                    onClick={() => pickHistory(h)} />
                ))}
              </ul>
            </section>
          )}

          {q.trim().length >= 2 && (items.length > 0 || searching) && (
            <section className="flex flex-col gap-1.5">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">Foods</h2>
              {items.length > 0 ? (
                <ul className="card-grad divide-y divide-border overflow-hidden rounded-2xl border border-border">
                  {items.map((v) => (
                    <Row key={v.fdcId} name={v.name} sub={macroLine(v.per100g)} badge={v.badge} onClick={() => pickItem(v)} />
                  ))}
                </ul>
              ) : (
                <p className="px-1 text-[13px] text-muted">Searching…</p>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
