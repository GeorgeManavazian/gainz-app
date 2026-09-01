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

export type Exercise = { name: string; muscles: MuscleGroup[] };

const e = (name: string, ...muscles: MuscleGroup[]): Exercise => ({ name, muscles });

export const EXERCISES: Exercise[] = [
  // chest
  e("DB Chest Press", "chest", "triceps"),
  e("Incline DB Press", "chest", "shoulders"),
  e("Decline DB Press", "chest"),
  e("BB Bench Press", "chest", "triceps"),
  e("Incline BB Bench Press", "chest", "shoulders"),
  e("Decline BB Bench Press", "chest"),
  e("Machine Chest Press", "chest"),
  e("Incline Machine Press", "chest", "shoulders"),
  e("Smith Machine Bench Press", "chest"),
  e("Smith Machine Incline Press", "chest", "shoulders"),
  e("Pec Deck", "chest"),
  e("Cable Fly", "chest"),
  e("Low Cable Fly", "chest"),
  e("High Cable Fly", "chest"),
  e("DB Fly", "chest"),
  e("Incline DB Fly", "chest"),
  e("Push-Up", "chest", "triceps"),
  e("Weighted Push-Up", "chest", "triceps"),
  e("Dip", "chest", "triceps"),
  e("Weighted Dip", "chest", "triceps"),
  e("DB Pullover", "chest", "back"),
  // back
  e("Lat Pulldown", "back"),
  e("Close Grip Lat Pulldown", "back"),
  e("Single Arm Lat Pulldown", "back"),
  e("Straight Arm Pulldown", "back"),
  e("Pull-Up", "back", "biceps"),
  e("Weighted Pull-Up", "back", "biceps"),
  e("Chin-Up", "back", "biceps"),
  e("Assisted Pull-Up", "back", "biceps"),
  e("Cable Row", "back"),
  e("Seated Cable Row", "back"),
  e("Single Arm Cable Row", "back"),
  e("Chest Supported Row", "back"),
  e("Machine Row", "back"),
  e("T-Bar Row", "back"),
  e("BB Row", "back"),
  e("Pendlay Row", "back"),
  e("Single Arm DB Row", "back"),
  e("DB Row", "back"),
  e("Meadows Row", "back"),
  e("Inverted Row", "back"),
  e("Deadlift", "back", "hamstrings_glutes"),
  e("Trap Bar Deadlift", "back", "quads", "hamstrings_glutes"),
  e("Rack Pull", "back"),
  e("Face Pull", "back", "shoulders"),
  e("Reverse Pec Deck", "back", "shoulders"),
  e("BB Shrug", "back"),
  e("DB Shrug", "back"),
  e("Back Extension", "back", "hamstrings_glutes"),
  // shoulders
  e("Seated Shoulder Press", "shoulders", "triceps"),
  e("Standing Shoulder Press", "shoulders", "triceps"),
  e("Seated DB Shoulder Press", "shoulders", "triceps"),
  e("Arnold Press", "shoulders"),
  e("Machine Shoulder Press", "shoulders", "triceps"),
  e("Smith Machine Shoulder Press", "shoulders", "triceps"),
  e("Overhead Press", "shoulders", "triceps"),
  e("Push Press", "shoulders", "triceps"),
  e("Landmine Press", "shoulders", "chest"),
  e("DB Lateral Raise", "shoulders"),
  e("Cable Lateral Raise", "shoulders"),
  e("Machine Lateral Raise", "shoulders"),
  e("Leaning Lateral Raise", "shoulders"),
  e("DB Front Raise", "shoulders"),
  e("Plate Front Raise", "shoulders"),
  e("Rear Delt Fly", "shoulders", "back"),
  e("Cable Rear Delt Fly", "shoulders", "back"),
  e("Upright Row", "shoulders", "back"),
  // biceps
  e("BB Curl", "biceps"),
  e("EZ Bar Curl", "biceps"),
  e("DB Curl", "biceps"),
  e("Alternating DB Curl", "biceps"),
  e("Incline DB Curl", "biceps"),
  e("Hammer Curl", "biceps"),
  e("Cross Body Hammer Curl", "biceps"),
  e("Preacher Curl", "biceps"),
  e("Machine Preacher Curl", "biceps"),
  e("Cable Curl", "biceps"),
  e("Bayesian Cable Curl", "biceps"),
  e("Concentration Curl", "biceps"),
  e("Spider Curl", "biceps"),
  e("Reverse Curl", "biceps"),
  e("Drag Curl", "biceps"),
  // triceps
  e("Single Arm Tricep Extension", "triceps"),
  e("Cable Tricep Pushdown", "triceps"),
  e("Rope Pushdown", "triceps"),
  e("Straight Bar Pushdown", "triceps"),
  e("Overhead Cable Extension", "triceps"),
  e("Overhead DB Extension", "triceps"),
  e("Skull Crusher", "triceps"),
  e("DB Skull Crusher", "triceps"),
  e("Close Grip Bench Press", "triceps", "chest"),
  e("Tricep Kickback", "triceps"),
  e("Machine Tricep Extension", "triceps"),
  e("JM Press", "triceps"),
  e("Bench Dip", "triceps"),
  // quads
  e("Back Squat", "quads", "hamstrings_glutes"),
  e("Front Squat", "quads"),
  e("Goblet Squat", "quads"),
  e("Hack Squat", "quads"),
  e("Smith Machine Squat", "quads", "hamstrings_glutes"),
  e("Leg Press", "quads", "hamstrings_glutes"),
  e("Single Leg Press", "quads", "hamstrings_glutes"),
  e("Leg Extension", "quads"),
  e("Single Leg Extension", "quads"),
  e("Bulgarian Split Squat", "quads", "hamstrings_glutes"),
  e("Walking Lunge", "quads", "hamstrings_glutes"),
  e("Reverse Lunge", "quads", "hamstrings_glutes"),
  e("DB Step-Up", "quads", "hamstrings_glutes"),
  e("Sissy Squat", "quads"),
  e("Pendulum Squat", "quads"),
  e("Belt Squat", "quads", "hamstrings_glutes"),
  // hamstrings / glutes
  e("Romanian Deadlift", "hamstrings_glutes", "back"),
  e("DB Romanian Deadlift", "hamstrings_glutes", "back"),
  e("Stiff Leg Deadlift", "hamstrings_glutes", "back"),
  e("Sumo Deadlift", "hamstrings_glutes", "quads", "back"),
  e("Lying Leg Curl", "hamstrings_glutes"),
  e("Seated Leg Curl", "hamstrings_glutes"),
  e("Single Leg Curl", "hamstrings_glutes"),
  e("Nordic Curl", "hamstrings_glutes"),
  e("Hip Thrust", "hamstrings_glutes"),
  e("BB Hip Thrust", "hamstrings_glutes"),
  e("Machine Hip Thrust", "hamstrings_glutes"),
  e("Glute Bridge", "hamstrings_glutes"),
  e("Cable Kickback", "hamstrings_glutes"),
  e("Hip Abduction", "hamstrings_glutes"),
  e("Hip Adduction", "hamstrings_glutes"),
  e("Good Morning", "hamstrings_glutes", "back"),
  e("Kettlebell Swing", "hamstrings_glutes"),
  e("Standing Calf Raise", "hamstrings_glutes"),
  e("Seated Calf Raise", "hamstrings_glutes"),
  e("Leg Press Calf Raise", "hamstrings_glutes"),
  // core
  e("Cable Crunch", "core"),
  e("Machine Crunch", "core"),
  e("Hanging Leg Raise", "core"),
  e("Hanging Knee Raise", "core"),
  e("Captain's Chair Leg Raise", "core"),
  e("Decline Sit-Up", "core"),
  e("Weighted Sit-Up", "core"),
  e("Ab Wheel Rollout", "core"),
  e("Plank", "core"),
  e("Weighted Plank", "core"),
  e("Side Plank", "core"),
  e("Russian Twist", "core"),
  e("Cable Woodchop", "core"),
  e("Pallof Press", "core"),
  e("Dead Bug", "core"),
  e("Farmer's Carry", "core", "back"),
];

export function normalizeName(s: string): string {
  return s.trim().toLowerCase();
}

const BY_NAME = new Map(EXERCISES.map((x) => [normalizeName(x.name), x]));

export function findExercise(name: string): Exercise | undefined {
  return BY_NAME.get(normalizeName(name));
}

export function exercisesFor(groups: MuscleGroup[]): Exercise[] {
  if (groups.length === 0) return [];
  const set = new Set(groups);
  return EXERCISES.filter((x) => x.muscles.some((m) => set.has(m)));
}

export function searchExercises(query: string): Exercise[] {
  const q = normalizeName(query);
  if (!q) return [];
  return EXERCISES.filter((x) => normalizeName(x.name).includes(q));
}

export function muscleLabel(id: MuscleGroup): string {
  return MUSCLE_GROUPS.find((m) => m.id === id)?.label ?? id;
}

export function muscleShort(id: MuscleGroup | undefined): string {
  if (!id) return "••";
  return MUSCLE_GROUPS.find((m) => m.id === id)?.short ?? "••";
}
