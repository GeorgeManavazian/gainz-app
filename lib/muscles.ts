export type MuscleGroup =
  | "chest" | "back" | "shoulders" | "biceps" | "triceps"
  | "quads" | "hamstrings_glutes" | "core";

export const MUSCLE_GROUPS: { id: MuscleGroup; label: string; short: string }[] = [
  { id: "chest", label: "Chest", short: "CH" },
  { id: "back", label: "Back", short: "BK" },
  { id: "shoulders", label: "Shoulders", short: "SH" },
  { id: "biceps", label: "Biceps", short: "BI" },
  { id: "triceps", label: "Triceps", short: "TR" },
  { id: "quads", label: "Quads", short: "QD" },
  { id: "hamstrings_glutes", label: "Hams & Glutes", short: "HG" },
  { id: "core", label: "Core", short: "CO" },
];

export const PRESETS: Record<"upper" | "lower", MuscleGroup[]> = {
  upper: ["chest", "back", "shoulders", "biceps", "triceps"],
  lower: ["quads", "hamstrings_glutes", "core"],
};

export type Muscle =
  | "upper_chest" | "mid_chest" | "lower_chest" | "front_delts" | "side_delts" | "rear_delts"
  | "lats" | "upper_back" | "traps" | "lower_back" | "biceps" | "triceps" | "forearms"
  | "quads" | "hamstrings" | "glutes" | "calves" | "abs";

export const MUSCLES: { id: Muscle; label: string; region: MuscleGroup; target: number | null }[] = [
  { id: "upper_chest", label: "Upper chest", region: "chest", target: 2 },
  { id: "mid_chest", label: "Mid chest", region: "chest", target: 2 },
  { id: "lower_chest", label: "Lower chest", region: "chest", target: null },
  { id: "front_delts", label: "Front delts", region: "shoulders", target: null },
  { id: "side_delts", label: "Side delts", region: "shoulders", target: 2 },
  { id: "rear_delts", label: "Rear delts", region: "shoulders", target: 2 },
  { id: "lats", label: "Lats", region: "back", target: 2 },
  { id: "upper_back", label: "Upper back", region: "back", target: 2 },
  { id: "traps", label: "Traps", region: "back", target: null },
  { id: "lower_back", label: "Lower back", region: "back", target: 2 },
  { id: "biceps", label: "Biceps", region: "biceps", target: 2 },
  { id: "triceps", label: "Triceps", region: "triceps", target: 2 },
  { id: "forearms", label: "Forearms", region: "biceps", target: null },
  { id: "quads", label: "Quads", region: "quads", target: 2 },
  { id: "hamstrings", label: "Hamstrings", region: "hamstrings_glutes", target: 2 },
  { id: "glutes", label: "Glutes", region: "hamstrings_glutes", target: 2 },
  { id: "calves", label: "Calves", region: "quads", target: null },
  { id: "abs", label: "Abs", region: "core", target: null },
];

export const REGION_DEFAULT: Record<MuscleGroup, Muscle> = {
  chest: "mid_chest",
  shoulders: "side_delts",
  back: "lats",
  biceps: "biceps",
  triceps: "triceps",
  quads: "quads",
  hamstrings_glutes: "hamstrings",
  core: "abs",
};

const byId = new Map(MUSCLES.map((m) => [m.id, m]));

export function regionOf(m: Muscle): MuscleGroup {
  return byId.get(m)!.region;
}
export function muscleName(m: Muscle): string {
  return byId.get(m)!.label;
}
export function targetOf(m: Muscle): number | null {
  return byId.get(m)!.target;
}
export function musclesIn(region: MuscleGroup): Muscle[] {
  return MUSCLES.filter((m) => m.region === region).map((m) => m.id);
}
export function isMuscle(s: unknown): s is Muscle {
  return typeof s === "string" && byId.has(s as Muscle);
}
