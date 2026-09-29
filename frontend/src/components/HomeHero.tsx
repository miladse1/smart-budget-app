import { PiggyBank } from "lucide-react";
import type { ReactNode } from "react";
import type { Dashboard } from "../api/types";
import { daysLeftInPeriod, formatMoney, fromCents, percentUsed, toCents } from "../lib/money";
import { ButtonLink } from "./ui";

/** "$500.50" -> ["$500", ".50"] so the cents can be set smaller, editorial style. */
function splitCents(text: string): [string, string] {
  const dot = text.lastIndexOf(".");
  return dot === -1 ? [text, ""] : [text.slice(0, dot), text.slice(dot)];
}

/**
 * The first thing on Home: what is left of this month's budgets, set large on an
 * off-black section, with progress and a safe amount to spend per remaining day.
 */
export function HomeHero({
  summary,
  currency,
  budgetCount,
  periodStart,
  periodEnd,
  monthLabel,
  today,
  top,
  className = "",
}: {
  summary: Dashboard["summary"];
  currency: string;
  budgetCount: number;
  periodStart: string;
  periodEnd: string;
  monthLabel: string;
  today?: Date;
  top?: ReactNode;
  className?: string;
}) {
  const remainingCents = toCents(summary.remaining);
  const hasBudget = toCents(summary.total_budget) > 0;
  const over = remainingCents < 0;
  const percent = percentUsed(summary.spent, summary.total_budget);
  const daysLeft = daysLeftInPeriod(periodStart, periodEnd, today);
  const perDay = daysLeft && remainingCents > 0 ? formatMoney(fromCents(Math.floor(remainingCents / daysLeft)), currency) : null;
  const [whole, cents] = splitCents(formatMoney(over ? summary.remaining.slice(1) : summary.remaining, currency));
  const fill = Math.max(0, Math.min(percent, 100));

  return (
    <section aria-label="Month summary" className={`bg-noir text-noir-ink ${className}`}>
      {top}
      {hasBudget ? (
        <div className="mt-8">
          <p className="text-[15px] text-noir-muted">
            {over ? "Over budget" : "Left to spend"} in {monthLabel}
          </p>
          <p className={`tnum mt-1 font-semibold tracking-[-0.05em] ${over ? "text-[#ff9f8f]" : ""}`}>
            <span className="sr-only">Remaining budget </span>
            <span className="text-[60px] leading-none">{whole}</span>
            <span className="text-[30px] leading-none text-noir-muted">{cents}</span>
          </p>

          <div
            role="meter"
            aria-label="Monthly budget used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={fill}
            aria-valuetext={`${percent}% used`}
            className="mt-6 h-2 w-full overflow-hidden rounded-full bg-white/12"
          >
            <div
              className={`h-full w-full origin-left rounded-full transition-transform duration-700 ease-out-soft ${over ? "bg-[#ff9f8f]" : percent >= 85 ? "bg-pastel-yellow" : "bg-pastel-lime"}`}
              style={{ transform: `scaleX(${fill / 100})` }}
            />
          </div>
          <div className="tnum mt-3 flex items-center justify-between gap-3 text-[13px] text-noir-muted">
            <span>
              {percent}% of {formatMoney(summary.total_budget, currency)} used
              <span className="sr-only"> across {budgetCount === 1 ? "1 category" : `${budgetCount} categories`}</span>
            </span>
            {daysLeft !== null && (
              <span>
                {daysLeft} {daysLeft === 1 ? "day" : "days"} left
              </span>
            )}
          </div>

          <p className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-full bg-pastel-lime px-4 text-[14px] font-semibold text-pastel-ink">
            {perDay ? (
              <>
                <span className="tnum">{perDay}</span>
                <span className="font-medium">a day is safe to spend</span>
              </>
            ) : over ? (
              "Pause spending until next month"
            ) : (
              "Budget month has ended"
            )}
          </p>
        </div>
      ) : (
        <div className="mt-8">
          <p className="text-[34px] leading-[1.1] font-semibold tracking-[-0.04em]">No budgets yet</p>
          <p className="mt-2 max-w-[30ch] text-[15px] text-noir-muted">Give a category a monthly limit and BudgetFlow tracks what is left.</p>
          <ButtonLink to="/budgets" variant="lime" className="mt-6 bg-pastel-lime text-pastel-ink">
            <PiggyBank size={17} aria-hidden="true" />
            Create a budget
          </ButtonLink>
        </div>
      )}
    </section>
  );
}
