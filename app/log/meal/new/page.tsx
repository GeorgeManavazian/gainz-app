"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import FoodPicker from "@/components/FoodPicker";
import MacroSheet from "@/components/MacroSheet";
import { createPattern } from "@/lib/patterns-db";
import { itemsFromMeals, scaleItem, totals, unitOf, type PatternItem } from "@/lib/patterns";
import type { MealEntry } from "@/lib/log";

type Line = { key: number; item: PatternItem };

const BackIcon = () => (
  <svg viewBox="0 0 256 256" className="h-7 w-7" fill="currentColor" aria-hidden>
    <path d="M224,128a8,8,0,0,1-8,8H120v64a8,8,0,0,1-13.66,5.66l-72-72a8,8,0,0,1,0-11.32l72-72A8,8,0,0,1,120,56v64h96A8,8,0,0,1,224,128Z" />
  </svg>
);

const BowlIcon = () => (
  <svg viewBox="0 0 256 256" className="h-6 w-6" fill="currentColor" aria-hidden>
    <path d="M224,104h-8.37a88,88,0,0,0-175.26,0H32a8,8,0,0,0-8,8,104.35,104.35,0,0,0,56,92.28V208a16,16,0,0,0,16,16h64a16,16,0,0,0,16-16v-3.72A104.35,104.35,0,0,0,232,112,8,8,0,0,0,224,104ZM173.48,56.23q2.75,2.25,5.27,4.75a87.92,87.92,0,0,0-49.15,43H100.1A72.26,72.26,0,0,1,168,56C169.83,56,171.66,56.09,173.48,56.23ZM148.12,104a71.84,71.84,0,0,1,41.27-29.57A71.45,71.45,0,0,1,199.54,104ZM128,40a71.87,71.87,0,0,1,19,2.57A88.36,88.36,0,0,0,83.33,104H56.46A72.08,72.08,0,0,1,128,40Z" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M9 12h6" /><path d="M12 9v6" />
  </svg>
);

const BarsIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4.5 19V15.5Q4.5 14.5 5.5 14.5H7Q8 14.5 8 15.5V19Q8 20 7 20H5.5Q4.5 20 4.5 19Z" />
    <path d="M10.25 19V11Q10.25 10 11.25 10H12.75Q13.75 10 13.75 11V19Q13.75 20 12.75 20H11.25Q10.25 20 10.25 19Z" />
    <path d="M16 19V6.5Q16 5.5 17 5.5H18.5Q19.5 5.5 19.5 6.5V19Q19.5 20 18.5 20H17Q16 20 16 19Z" />
  </svg>
);

const SaveIcon = () => (
  <svg viewBox="0 0 256 256" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="16"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M216,83.31V208a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V48a8,8,0,0,1,8-8H172.69a8,8,0,0,1,5.65,2.34l35.32,35.32A8,8,0,0,1,216,83.31Z" />
    <path d="M80,216V152a8,8,0,0,1,8-8h80a8,8,0,0,1,8,8v64" />
    <line x1="152" y1="72" x2="96" y2="72" />
  </svg>
);

const XIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M18 6l-12 12" /><path d="M6 6l12 12" />
  </svg>
);

export default function NewMeal() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [mode, setMode] = useState<"list" | "food" | "macros">("list");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const nextKey = useMemo(() => (lines.length ? Math.max(...lines.map((l) => l.key)) + 1 : 0), [lines]);

  const entries = lines.map((l) => scaleItem(l.item, l.item.grams));
  const sum = totals(entries);
  const canSave = name.trim().length > 0 && lines.length > 0 && !busy;

  function addFood(entry: MealEntry) {
    const [item] = itemsFromMeals([entry]);
    if (item) setLines((ls) => [...ls, { key: nextKey, item }]);
    setMode("list");
  }
  function addMacros(item: PatternItem) {
    setLines((ls) => [...ls, { key: nextKey, item }]);
    setMode("list");
  }

  async function save() {
    if (!canSave) return;
    setBusy(true); setErr("");
    try {
      await createPattern(name, lines.map((l) => l.item));
      router.replace("/log/meal");
    } catch { setErr("Couldn't save. Try again."); setBusy(false); }
  }

  const lineSub = (l: Line, e: MealEntry) =>
    `${unitOf(l.item) === "g" ? `${l.item.grams} g` : `${l.item.grams} serving${l.item.grams === 1 ? "" : "s"}`} · ${Math.round(e.calories)} kcal · ${Math.round(e.protein_g)} P`;

  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background px-4 pb-10 pt-6 text-foreground">
        <div className="flex items-center gap-3">
          {mode === "list" ? (
            <Link href="/log/meal" aria-label="Back" className="text-accent">
              <BackIcon />
            </Link>
          ) : (
            <button type="button" aria-label="Cancel" onClick={() => setMode("list")} className="text-accent">
              <BackIcon />
            </button>
          )}
          <h1 className="text-2xl font-bold leading-tight">{mode === "food" ? "Add food" : "New meal"}</h1>
        </div>

        {mode === "food" && <FoodPicker confirmLabel="Add to meal" onPick={addFood} />}

        {mode !== "food" && (
          <>
            <label className="relative block">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-accent">
                <BowlIcon />
              </span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Chipotle bowl"
                className="w-full rounded-2xl border border-border bg-surface py-3.5 pl-12 pr-4 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none" />
            </label>

            <ul className="card-grad divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {lines.map((l, i) => (
                <li key={l.key} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-foreground">{l.item.food_name}</span>
                    <span className="mt-0.5 block text-[12px] tabular-nums text-muted">{lineSub(l, entries[i])}</span>
                  </span>
                  <button type="button" aria-label={`Remove ${l.item.food_name}`}
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    className="flex h-10 w-10 shrink-0 items-center justify-center text-muted active:text-foreground">
                    <XIcon />
                  </button>
                </li>
              ))}
              {lines.length === 0 && <li className="px-4 py-3 text-sm text-muted">Nothing added yet.</li>}
            </ul>

            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setMode("food")}
                className="flex items-center justify-center gap-2 rounded-2xl border border-accent px-4 py-3.5 text-base font-semibold text-accent active:bg-accent/10">
                <PlusIcon /> Add food
              </button>
              <button type="button" onClick={() => setMode("macros")}
                className="flex items-center justify-center gap-2 rounded-2xl border border-accent px-4 py-3.5 text-base font-semibold text-accent active:bg-accent/10">
                <BarsIcon /> Add macros
              </button>
            </div>

            <div className="card-grad flex items-stretch divide-x divide-border rounded-2xl border border-border px-2 py-3.5 text-center">
              {([["kcal", sum.kcal], ["P", sum.protein_g], ["C", sum.carbs_g], ["F", sum.fat_g]] as const).map(([l, v]) => (
                <span key={l} className="flex flex-1 flex-col items-center justify-center gap-0.5 px-2">
                  <span className="text-2xl font-bold tabular-nums text-accent">{v}</span>
                  <span className="text-[12px] text-muted">{l}</span>
                </span>
              ))}
            </div>

            {err && <p className="text-sm text-danger">{err}</p>}
            <button type="button" onClick={save} disabled={!canSave}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-4 text-lg font-semibold text-accent-foreground active:opacity-80 disabled:opacity-40">
              {busy ? "Saving…" : (<><SaveIcon /> Save meal</>)}
            </button>
          </>
        )}

        {mode === "macros" && <MacroSheet onAdd={addMacros} onClose={() => setMode("list")} />}
      </main>
    </AuthGuard>
  );
}
