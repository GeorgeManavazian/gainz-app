import { makeExercise, normalizeName, type Exercise, type Library } from "./exercises";
import { isMuscle, type Muscle } from "./muscles";

export type CustomExerciseRow = { id: string; name: string; primary_muscles: Muscle[]; secondary_muscles: Muscle[] };

/** Null when no valid primary muscle remains after dropping unknown ids. */
export function toExercise(row: CustomExerciseRow): Exercise | null {
  const primary = row.primary_muscles.filter(isMuscle);
  if (primary.length === 0) return null;
  const secondary = row.secondary_muscles.filter(isMuscle).filter((m) => !primary.includes(m));
  return makeExercise(row.name.trim(), primary, secondary);
}

/** Built-ins first, then customs whose normalised name isn't already taken. */
export function mergeLibrary(builtins: Library, customs: CustomExerciseRow[]): Library {
  const seen = new Set(builtins.map((x) => normalizeName(x.name)));
  const out = [...builtins];
  for (const row of customs) {
    const ex = toExercise(row);
    if (!ex) continue;
    const key = normalizeName(ex.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ex);
  }
  return out;
}
