/** Morning sleep rating, 1 (awful) … 5 (great). Pure — safe to import anywhere. */
export const SLEEP_LABELS = ["Awful", "Poor", "OK", "Good", "Great"] as const;
export const isQuality = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5;
