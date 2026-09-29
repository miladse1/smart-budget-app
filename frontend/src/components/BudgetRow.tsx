import { ChevronRight } from "lucide-react";
import { CategoryIcon } from "./CategoryIcon";
import { ProgressBar, type Status } from "./ui";
import { formatMoney, percentUsed, remainingAmount, statusFor, toCents } from "../lib/money";

export const STATUS_TEXT: Record<Status, string> = {
  ok: "text-muted",
  near: "text-warning",
  over: "text-danger",
};

export function remainingLabelFor(limit: string, spent: string, currency: string): string {
  const remaining = remainingAmount(limit, spent);
  const cents = toCents(remaining);
  if (cents < 0) return `${formatMoney(remaining.slice(1), currency)} over`;
  if (cents === 0) return "At limit";
  return `${formatMoney(remaining, currency)} left`;
}

/**
 * One category budget: name and remaining amount on top, progress below, spent of limit
 * and percent underneath. Rendered as a button when it opens an editor.
 */
export function BudgetRow({
  name,
  icon,
  colour,
  spent,
  limit,
  currency,
  onOpen,
}: {
  name: string;
  icon: string;
  colour: string;
  spent: string;
  limit: string;
  currency: string;
  onOpen?: () => void;
}) {
  const percent = percentUsed(spent, limit);
  const status = statusFor(spent, limit);
  const remainingLabel = remainingLabelFor(limit, spent, currency);
  const statusPrefix = status === "over" ? "Over budget · " : status === "near" && remainingLabel !== "At limit" ? "Near limit · " : "";

  const body = (
    <>
      <CategoryIcon name={name} icon={icon} colour={colour} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">{name}</p>
          <p className={`tnum shrink-0 text-[15px] font-semibold ${status === "over" ? "text-danger" : "text-ink"}`}>{remainingLabel}</p>
        </div>
        <ProgressBar percent={percent} status={status} label={`${name} budget used`} className="mt-2 h-1.5" />
        <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[13px]">
          <p className="tnum truncate text-muted">
            {formatMoney(spent, currency)} of {formatMoney(limit, currency)}
          </p>
          <p className={`tnum shrink-0 font-medium ${STATUS_TEXT[status]}`}>
            {statusPrefix}
            {percent}%
          </p>
        </div>
      </div>
      {onOpen && <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-subtle" />}
    </>
  );

  if (onOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${name}: ${remainingLabel}, ${percent}% used. Edit budget`}
        className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/60 active:bg-surface-2"
      >
        {body}
      </button>
    );
  }
  return <div className="flex items-center gap-3.5 px-4 py-3.5">{body}</div>;
}
