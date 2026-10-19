import { describe, it, expect } from "vitest";
import { EXERCISES, findExercise, exercisesFor, searchExercises, exercisesForMuscle } from "./exercises";
import { mergeLibrary, toExercise } from "./custom-exercises";

const row = (name: string, primary: string[]) => ({ id: name, name, primary_muscles: primary as never, secondary_muscles: [] });

describe("custom exercises", () => {
  it("toExercise derives regions and drops unknown muscle ids", () => {
    expect(toExercise(row("Cable Y Raise", ["rear_delts", "bogus"]))).toMatchObject({ primary: ["rear_delts"], muscles: ["shoulders"] });
    expect(toExercise(row("Nothing", ["bogus"]))).toBeNull();
  });
  it("mergeLibrary: built-in wins on a normalised-name collision", () => {
    const lib = mergeLibrary(EXERCISES, [row(" lat pulldown ", ["biceps"]), row("Cable Y Raise", ["rear_delts"])]);
    expect(lib.length).toBe(EXERCISES.length + 1);
    expect(findExercise("Lat Pulldown", lib)!.primary).toEqual(["lats"]);
    expect(findExercise("cable y raise", lib)!.name).toBe("Cable Y Raise");
  });
  it("custom rows show up in sections, search and muscle lookup", () => {
    const lib = mergeLibrary(EXERCISES, [row("Cable Y Raise", ["rear_delts"])]);
    expect(exercisesFor(["shoulders"], lib).some((x) => x.name === "Cable Y Raise")).toBe(true);
    expect(searchExercises("y raise", lib).map((x) => x.name)).toEqual(["Cable Y Raise"]);
    expect(exercisesForMuscle("rear_delts", lib).some((x) => x.name === "Cable Y Raise")).toBe(true);
  });
});
