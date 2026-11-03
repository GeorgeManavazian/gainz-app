// components/ChecksRow.tsx
"use client";
import type { Check } from "@/lib/meal-checks";

/** Five controllables as compact pills: ✓ green, ✗ red, · undecided. */
export default function ChecksRow({ checks }: { checks: Check[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Today's controllables">
      {checks.map((c) => (
        <li key={c.key} title={c.detail}
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            c.ok === true ? "bg-success/15 text-success" : c.ok === false ? "bg-danger/15 text-danger" : "bg-surface-2 text-muted"}`}>
          <span aria-hidden>{c.ok === true ? "✓" : c.ok === false ? "✗" : "·"}</span>
          <span>{c.label}</span>
          <span className="sr-only">{c.ok === true ? "yes" : c.ok === false ? "no" : "not yet"}{c.detail ? `, ${c.detail}` : ""}</span>
        </li>
      ))}
    </ul>
  );
}
