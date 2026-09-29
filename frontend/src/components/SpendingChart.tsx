import { PieChart as PieIcon } from "lucide-react";
import { useState } from "react";
import type { Dashboard } from "../api/types";
import { categoryColour } from "../lib/categories";
import { formatMoney, fromCents, toCents } from "../lib/money";
import { EmptyState } from "./ui";

const SIZE = 176;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 3;

/**
 * Spending by category: a donut for share plus a ranked legend that carries every
 * label and amount directly, so identity never depends on colour alone.
 */
export function SpendingChart({
  slices,
  overspending,
  currency,
  stacked = false,
}: {
  slices: Dashboard["spending_by_category"];
  overspending: Dashboard["overspending"];
  currency: string;
  stacked?: boolean;
}) {
  const [active, setActive] = useState<string | null>(null);
  const data = slices
    .map((slice) => ({ name: slice.name, cents: toCents(slice.spent), spent: slice.spent, colour: categoryColour(slice.name, slice.colour) }))
    .filter((slice) => slice.cents > 0)
    .sort((a, b) => b.cents - a.cents);
  const total = data.reduce((sum, slice) => sum + slice.cents, 0);
  const overNames = new Set(overspending.map((item) => item.name));

  if (data.length === 0) {
    return (
      <EmptyState compact icon={PieIcon} title="No spending yet">
        Purchases in this period will be grouped here by category.
      </EmptyState>
    );
  }

  let offset = 0;
  const segments = data.map((slice) => {
    const length = (slice.cents / total) * CIRCUMFERENCE;
    const segment = { ...slice, length: Math.max(length - GAP, 1), offset };
    offset += length;
    return segment;
  });
  const focus = data.find((slice) => slice.name === active);

  return (
    <div className={`flex flex-col items-center gap-5 ${stacked ? "" : "sm:flex-row sm:items-center sm:gap-7"}`}>
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90" role="img" aria-label="Share of spending by category">
          {segments.map((segment) => (
            <circle
              key={segment.name}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={segment.colour}
              strokeWidth={active === segment.name ? STROKE + 4 : STROKE}
              strokeDasharray={`${segment.length} ${CIRCUMFERENCE}`}
              strokeDashoffset={-segment.offset}
              opacity={active && active !== segment.name ? 0.35 : 1}
              className="transition-[opacity,stroke-width] duration-200"
              onMouseEnter={() => setActive(segment.name)}
              onMouseLeave={() => setActive(null)}
            >
              <title>{`${segment.name}: ${formatMoney(segment.spent, currency)}`}</title>
            </circle>
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-[12px] font-medium text-muted">{focus ? focus.name : "Spent"}</p>
            <p className="tnum text-[20px] font-semibold tracking-[-0.03em]">{formatMoney(focus ? focus.spent : fromCents(total), currency)}</p>
            {focus && <p className="tnum text-[12px] text-muted">{Math.round((focus.cents / total) * 100)}%</p>}
          </div>
        </div>
      </div>

      <ul aria-label="Spending by category, largest first" className="w-full min-w-0 flex-1">
        {data.map((slice) => {
          const share = Math.round((slice.cents / total) * 100);
          return (
            <li
              key={slice.name}
              tabIndex={0}
              onMouseEnter={() => setActive(slice.name)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(slice.name)}
              onBlur={() => setActive(null)}
              className={`flex items-center gap-3 rounded-[12px] px-2 py-2 text-[14px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink ${
                active === slice.name ? "bg-surface-2" : ""
              }`}
            >
              <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.colour }} />
              <span className="min-w-0 flex-1 truncate font-medium">
                {slice.name}
                {overNames.has(slice.name) && <span className="ml-1.5 text-[12px] font-semibold text-danger">Over</span>}
              </span>
              <span className="tnum w-10 shrink-0 text-right text-[13px] text-muted">
                <span className="sr-only">, </span>
                {share}%
              </span>
              <span className="tnum w-24 shrink-0 text-right font-semibold">
                <span className="sr-only">, </span>
                {formatMoney(slice.spent, currency)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
