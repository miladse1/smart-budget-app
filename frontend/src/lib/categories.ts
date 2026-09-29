/**
 * Category identity colours. The API's category colours are near-identical greens,
 * so each category gets a fixed slot from the validated categorical palette instead.
 * Colour follows the category, never its rank.
 */
const SLOTS: Record<string, string> = {
  Transportation: "var(--cat-blue)",
  Food: "var(--cat-orange)",
  Groceries: "var(--cat-aqua)",
  Bills: "var(--cat-yellow)",
  Entertainment: "var(--cat-magenta)",
  Education: "var(--cat-green)",
  Shopping: "var(--cat-violet)",
  Health: "var(--cat-red)",
  Income: "var(--cat-forest)",
  Transfer: "var(--cat-grey)",
  Other: "var(--cat-grey)",
};

export function categoryColour(name: string, fallback?: string): string {
  return SLOTS[name] ?? fallback ?? "var(--cat-grey)";
}

/** Pastel tile colours for the playful style. Decorative: the icon and name carry identity. */
const PASTELS: Record<string, string> = {
  Food: "var(--pastel-yellow)",
  Groceries: "var(--pastel-lime)",
  Transportation: "var(--pastel-blue)",
  Shopping: "var(--pastel-lavender)",
  Entertainment: "var(--pastel-blush)",
  Bills: "var(--pastel-yellow)",
  Health: "var(--pastel-blush)",
  Education: "var(--pastel-blue)",
  Income: "var(--pastel-lime)",
  Transfer: "var(--pastel-lavender)",
};

export function categoryPastel(name: string): string {
  return PASTELS[name] ?? "#ecebe5";
}

/** Starting suggestions for onboarding, per month in the user's currency. Always editable. */
export const SUGGESTED_BUDGETS: Record<string, { amount: string; goals: string[] }> = {
  Groceries: { amount: "400", goals: ["spending", "saving", "tracking", "all"] },
  Food: { amount: "150", goals: ["spending", "saving", "all"] },
  Transportation: { amount: "120", goals: ["spending", "tracking", "all"] },
  Bills: { amount: "250", goals: ["tracking", "saving", "all"] },
  Shopping: { amount: "100", goals: ["spending", "saving", "all"] },
  Entertainment: { amount: "60", goals: ["spending", "saving", "all"] },
  Health: { amount: "50", goals: ["tracking", "all"] },
  Education: { amount: "40", goals: ["tracking"] },
  Other: { amount: "50", goals: ["tracking"] },
};
