import { MUSCLE_GROUPS, regionOf } from "./muscles";
import type { Muscle, MuscleGroup } from "./muscles";
export { MUSCLE_GROUPS, PRESETS } from "./muscles";
export type { MuscleGroup } from "./muscles";

export type Exercise = { name: string; primary: Muscle[]; secondary: Muscle[]; muscles: MuscleGroup[] };

/** Builds an exercise; `muscles` (sections) are the regions of the primary muscles only. */
export function makeExercise(name: string, primary: Muscle[], secondary: Muscle[] = []): Exercise {
  if (primary.length === 0) throw new Error(`exercise "${name}" needs at least one primary muscle`);
  return { name, primary: [...primary], secondary: [...secondary], muscles: [...new Set(primary.map(regionOf))] };
}

const e = makeExercise;

const PRESS: Muscle[] = ["triceps", "front_delts"];
const INCLINE_PRESS: Muscle[] = ["front_delts", "triceps"];
const VPULL: Muscle[] = ["biceps", "upper_back"];
const ROW_P: Muscle[] = ["upper_back", "lats"];
const ROW_S: Muscle[] = ["biceps", "rear_delts"];
const HINGE: Muscle[] = ["hamstrings", "glutes", "lower_back"];
const DL_S: Muscle[] = ["traps", "upper_back", "lats"];
const OHP_S: Muscle[] = ["triceps", "side_delts"];
const CG_S: Muscle[] = ["mid_chest", "front_delts"];
const LUNGE: Muscle[] = ["quads", "glutes"];

export const EXERCISES: Exercise[] = [
  // chest
  e("DB Chest Press", ["mid_chest"], PRESS),
  e("Incline DB Press", ["upper_chest"], INCLINE_PRESS),
  e("Decline DB Press", ["lower_chest"], PRESS),
  e("BB Bench Press", ["mid_chest"], PRESS),
  e("Incline BB Bench Press", ["upper_chest"], INCLINE_PRESS),
  e("Decline BB Bench Press", ["lower_chest"], PRESS),
  e("Machine Chest Press", ["mid_chest"], PRESS),
  e("Incline Machine Press", ["upper_chest"], INCLINE_PRESS),
  e("Smith Machine Bench Press", ["mid_chest"], PRESS),
  e("Smith Machine Incline Press", ["upper_chest"], INCLINE_PRESS),
  e("Pec Deck", ["mid_chest"]),
  e("Cable Fly", ["mid_chest"]),
  e("Low Cable Fly", ["upper_chest"]),
  e("High Cable Fly", ["lower_chest"]),
  e("DB Fly", ["mid_chest"]),
  e("Incline DB Fly", ["upper_chest"]),
  e("Push-Up", ["mid_chest"], PRESS),
  e("Weighted Push-Up", ["mid_chest"], PRESS),
  e("Dip", ["mid_chest"], [...PRESS, "lower_chest"]),
  e("Weighted Dip", ["mid_chest"], [...PRESS, "lower_chest"]),
  e("DB Pullover", ["lats"], ["upper_back"]),
  // back
  e("Lat Pulldown", ["lats"], VPULL),
  e("Close Grip Lat Pulldown", ["lats"], VPULL),
  e("Single Arm Lat Pulldown", ["lats"], VPULL),
  e("Straight Arm Pulldown", ["lats"], ["upper_back"]),
  e("Pull-Up", ["lats"], VPULL),
  e("Weighted Pull-Up", ["lats"], VPULL),
  e("Chin-Up", ["lats"], VPULL),
  e("Assisted Pull-Up", ["lats"], VPULL),
  e("Cable Row", ROW_P, ROW_S),
  e("Seated Cable Row", ROW_P, ROW_S),
  e("Single Arm Cable Row", ROW_P, ROW_S),
  e("Chest Supported Row", ROW_P, ROW_S),
  e("Machine Row", ROW_P, ROW_S),
  e("T-Bar Row", ROW_P, ROW_S),
  e("BB Row", ROW_P, ROW_S),
  e("Pendlay Row", ROW_P, ROW_S),
  e("Single Arm DB Row", ROW_P, ROW_S),
  e("DB Row", ROW_P, ROW_S),
  e("Meadows Row", ROW_P, ROW_S),
  e("Inverted Row", ROW_P, ROW_S),
  e("Deadlift", HINGE, DL_S),
  e("Trap Bar Deadlift", HINGE, [...DL_S, "quads"]),
  e("Rack Pull", ["hamstrings", "lower_back"], ["glutes", ...DL_S]),
  e("Face Pull", ["rear_delts"], ["upper_back"]),
  e("Reverse Pec Deck", ["rear_delts"], ["upper_back"]),
  e("BB Shrug", ["traps"]),
  e("DB Shrug", ["traps"]),
  e("Back Extension", ["hamstrings", "lower_back"], ["glutes"]),
  // shoulders
  e("Seated Shoulder Press", ["front_delts"], OHP_S),
  e("Standing Shoulder Press", ["front_delts"], OHP_S),
  e("Seated DB Shoulder Press", ["front_delts"], OHP_S),
  e("Arnold Press", ["front_delts"], OHP_S),
  e("Machine Shoulder Press", ["front_delts"], OHP_S),
  e("Smith Machine Shoulder Press", ["front_delts"], OHP_S),
  e("Overhead Press", ["front_delts"], OHP_S),
  e("Push Press", ["front_delts"], OHP_S),
  e("Landmine Press", ["front_delts"], [...OHP_S, "upper_chest"]),
  e("DB Lateral Raise", ["side_delts"]),
  e("Cable Lateral Raise", ["side_delts"]),
  e("Machine Lateral Raise", ["side_delts"]),
  e("Leaning Lateral Raise", ["side_delts"]),
  e("DB Front Raise", ["front_delts"]),
  e("Plate Front Raise", ["front_delts"]),
  e("Rear Delt Fly", ["rear_delts"], ["upper_back"]),
  e("Cable Rear Delt Fly", ["rear_delts"], ["upper_back"]),
  e("Upright Row", ["side_delts", "traps"]),
  // biceps
  e("BB Curl", ["biceps"]),
  e("EZ Bar Curl", ["biceps"]),
  e("DB Curl", ["biceps"]),
  e("Alternating DB Curl", ["biceps"]),
  e("Incline DB Curl", ["biceps"]),
  e("Hammer Curl", ["biceps", "forearms"]),
  e("Cross Body Hammer Curl", ["biceps", "forearms"]),
  e("Preacher Curl", ["biceps"]),
  e("Machine Preacher Curl", ["biceps"]),
  e("Cable Curl", ["biceps"]),
  e("Bayesian Cable Curl", ["biceps"]),
  e("Concentration Curl", ["biceps"]),
  e("Spider Curl", ["biceps"]),
  e("Reverse Curl", ["biceps", "forearms"]),
  e("Drag Curl", ["biceps"]),
  // triceps
  e("Single Arm Tricep Extension", ["triceps"]),
  e("Cable Tricep Pushdown", ["triceps"]),
  e("Rope Pushdown", ["triceps"]),
  e("Straight Bar Pushdown", ["triceps"]),
  e("Overhead Cable Extension", ["triceps"]),
  e("Overhead DB Extension", ["triceps"]),
  e("Skull Crusher", ["triceps"]),
  e("DB Skull Crusher", ["triceps"]),
  e("Close Grip Bench Press", ["triceps"], CG_S),
  e("Tricep Kickback", ["triceps"]),
  e("Machine Tricep Extension", ["triceps"]),
  e("JM Press", ["triceps"], CG_S),
  e("Bench Dip", ["triceps"], CG_S),
  // quads
  e("Back Squat", ["quads"], ["glutes", "lower_back"]),
  e("Front Squat", ["quads"], ["glutes"]),
  e("Goblet Squat", ["quads"], ["glutes"]),
  e("Hack Squat", ["quads"], ["glutes"]),
  e("Smith Machine Squat", ["quads"], ["glutes"]),
  e("Leg Press", ["quads"], ["glutes"]),
  e("Single Leg Press", ["quads"], ["glutes"]),
  e("Leg Extension", ["quads"]),
  e("Single Leg Extension", ["quads"]),
  e("Bulgarian Split Squat", LUNGE, ["hamstrings"]),
  e("Walking Lunge", LUNGE, ["hamstrings"]),
  e("Reverse Lunge", LUNGE, ["hamstrings"]),
  e("DB Step-Up", LUNGE, ["hamstrings"]),
  e("Sissy Squat", ["quads"]),
  e("Pendulum Squat", ["quads"], ["glutes"]),
  e("Belt Squat", ["quads"], ["glutes"]),
  // hamstrings / glutes
  e("Romanian Deadlift", HINGE, DL_S),
  e("DB Romanian Deadlift", HINGE, DL_S),
  e("Stiff Leg Deadlift", HINGE, DL_S),
  e("Sumo Deadlift", HINGE, [...DL_S, "quads"]),
  e("Lying Leg Curl", ["hamstrings"]),
  e("Seated Leg Curl", ["hamstrings"]),
  e("Single Leg Curl", ["hamstrings"]),
  e("Nordic Curl", ["hamstrings"]),
  e("Hip Thrust", ["glutes"]),
  e("BB Hip Thrust", ["glutes"]),
  e("Machine Hip Thrust", ["glutes"]),
  e("Glute Bridge", ["glutes"]),
  e("Cable Kickback", ["glutes"]),
  e("Hip Abduction", ["glutes"]),
  e("Hip Adduction", ["glutes"]),
  e("Good Morning", ["hamstrings", "lower_back"], ["glutes"]),
  e("Kettlebell Swing", ["glutes", "hamstrings"], ["lower_back"]),
  e("Standing Calf Raise", ["calves"]),
  e("Seated Calf Raise", ["calves"]),
  e("Leg Press Calf Raise", ["calves"]),
  // core
  e("Cable Crunch", ["abs"]),
  e("Machine Crunch", ["abs"]),
  e("Hanging Leg Raise", ["abs"]),
  e("Hanging Knee Raise", ["abs"]),
  e("Captain's Chair Leg Raise", ["abs"]),
  e("Decline Sit-Up", ["abs"]),
  e("Weighted Sit-Up", ["abs"]),
  e("Ab Wheel Rollout", ["abs"]),
  e("Plank", ["abs"]),
  e("Weighted Plank", ["abs"]),
  e("Side Plank", ["abs"]),
  e("Russian Twist", ["abs"]),
  e("Cable Woodchop", ["abs"]),
  e("Pallof Press", ["abs"]),
  e("Dead Bug", ["abs"]),
  e("Farmer's Carry", ["forearms", "traps"], ["abs"]),
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
