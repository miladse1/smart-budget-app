import type { Dashboard } from "../api/types";
import { formatMoney, toCents } from "../lib/money";

export function SummaryCards({
  summary,
  currency,
  budgetCount,
}: {
  summary: Dashboard["summary"];
  currency: string;
  budgetCount: number;
}) {
  const over = toCents(summary.remaining) < 0;
  const cards = [
    {
      label: "Remaining budget",
      value: summary.remaining,
      hint: over ? "Over the monthly plan" : "Left across category budgets",
      tone: over ? "text-danger" : "text-ink",
    },
    {
      label: "Spent this month",
      value: summary.spent,
      hint: "Purchases counted against budgets",
      tone: "text-ink",
    },
    {
      label: "Income this month",
      value: summary.income,
      hint: "Pay and other income",
      tone: "text-forest",
    },
    {
      label: "Total monthly budget",
      value: summary.total_budget,
      hint: budgetCount === 1 ? "1 category" : `${budgetCount} categories`,
      tone: "text-ink",
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <article key={card.label} className="rounded-lg border border-line bg-card px-3 py-2.5 shadow-sm">
          <p className="text-xs text-muted">{card.label}</p>
          <p className={`mt-1 text-xl font-semibold tracking-tight ${card.tone}`}>{formatMoney(card.value, currency)}</p>
          <p className="mt-0.5 text-xs text-muted">{card.hint}</p>
        </article>
      ))}
    </section>
  );
}
