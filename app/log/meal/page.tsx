"use client";
import { useEffect, useRef, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { logMeal } from "@/lib/log";

type Food = { fdcId: number; description: string;
  per100g: { kcal: number; protein: number; carbs: number; fat: number } };

export default function LogMeal() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [picked, setPicked] = useState<Food | null>(null);
  const [grams, setGrams] = useState("");
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/food-search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.foods);
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  const g = parseFloat(grams) || 0;
  const scale = (v: number) => Math.round(v * g / 100 * 10) / 10;

  async function save() {
    if (!picked || g <= 0) return;
    await logMeal({
      food_name: picked.description, grams: g,
      calories: scale(picked.per100g.kcal), protein_g: scale(picked.per100g.protein),
      carbs_g: scale(picked.per100g.carbs), fat_g: scale(picked.per100g.fat),
      fdc_id: String(picked.fdcId),
    });
    setPicked(null); setQ(""); setGrams(""); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <AuthGuard>
      <main className="mx-auto max-w-md p-4">
        <h1 className="mb-3 text-xl font-bold">Log meal</h1>
        {saved && <p className="mb-2 text-green-600">Logged ✓</p>}
        {!picked ? (
          <>
            <input className="w-full rounded border p-3" placeholder="Search food…"
              value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            <ul className="mt-2 divide-y">
              {results.map((f) => (
                <li key={f.fdcId}>
                  <button className="w-full p-3 text-left" onClick={() => setPicked(f)}>
                    {f.description}
                    <span className="block text-sm text-gray-500">
                      {Math.round(f.per100g.kcal)} kcal / 100g
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="font-medium">{picked.description}</p>
            <input className="rounded border p-3" inputMode="decimal" placeholder="grams"
              value={grams} onChange={(e) => setGrams(e.target.value)} autoFocus />
            <p className="text-sm text-gray-600">
              {scale(picked.per100g.kcal)} kcal · {scale(picked.per100g.protein)}P ·{" "}
              {scale(picked.per100g.carbs)}C · {scale(picked.per100g.fat)}F
            </p>
            <div className="flex gap-2">
              <button className="flex-1 rounded bg-black p-3 text-white"
                onClick={save} disabled={g <= 0}>Save</button>
              <button className="rounded border p-3" onClick={() => setPicked(null)}>Back</button>
            </div>
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
