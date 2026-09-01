/** Common-word → the foods a human actually means. Tapping a suggestion re-searches with the precise term. */
export const FOOD_ALIASES: Record<string, string[]> = {
  chicken: ["Chicken breast", "Chicken thigh", "Chicken drumstick", "Chicken wings", "Ground chicken", "Chicken tenders"],
  beef: ["Ground beef", "Beef steak", "Roast beef", "Beef ribs", "Beef jerky"],
  steak: ["Beef steak", "Pork steak", "Tuna steak"],
  pork: ["Pork chop", "Pork tenderloin", "Ground pork", "Pork ribs", "Bacon"],
  turkey: ["Turkey breast", "Ground turkey", "Turkey bacon", "Turkey sausage"],
  fish: ["Salmon", "Tilapia", "Cod", "Tuna", "Shrimp"],
  egg: ["Egg, whole", "Egg white", "Egg yolk", "Scrambled eggs", "Boiled egg"],
  eggs: ["Egg, whole", "Egg white", "Egg yolk", "Scrambled eggs", "Boiled egg"],
  rice: ["White rice", "Brown rice", "Fried rice", "Rice noodles"],
  potato: ["Baked potato", "Mashed potato", "French fries", "Sweet potato"],
  bread: ["White bread", "Whole wheat bread", "Bagel", "Sourdough bread", "Toast"],
  pasta: ["Spaghetti", "Penne", "Macaroni", "Pasta with tomato sauce"],
  milk: ["Milk, whole", "Milk, 2%", "Milk, skim", "Almond milk", "Oat milk"],
  cheese: ["Cheddar cheese", "Mozzarella cheese", "American cheese", "Cottage cheese", "Cream cheese"],
  yogurt: ["Greek yogurt", "Plain yogurt", "Vanilla yogurt"],
  oats: ["Oatmeal", "Overnight oats", "Granola"],
  beans: ["Black beans", "Pinto beans", "Chickpeas", "Green beans"],
  salad: ["Garden salad", "Caesar salad", "Chicken salad", "Tuna salad"],
  protein: ["Protein powder", "Protein bar", "Protein shake"],
  peanut: ["Peanut butter", "Peanuts"],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();

/** Suggestions when the query IS a common word (exact or its plural/singular). */
export function aliasSuggestions(q: string): string[] {
  const n = norm(q);
  if (!n) return [];
  const singular = n.endsWith("s") ? n.slice(0, -1) : n;
  return FOOD_ALIASES[n] ?? FOOD_ALIASES[singular] ?? [];
}
