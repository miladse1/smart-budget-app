import { CategoryIcon } from "./CategoryIcon";
import { barWidth, formatMoney, percentUsed, remainingAmount, statusFor, toCents } from "../lib/money";

export function BudgetRow({
  name,
  icon,
  colour,
  spent,
  limit,
  currency,
}: {
  name: string;
  icon: string;
  colour: string;
  spent: string;
  limit: string;
  currency: string;
}) {
  const remaining = remainingAmount(limit, spent);
  const percent = percentUsed(spent, limit);
  const status = statusFor(spent, limit);
  const remainingCents = toCents(remaining);
  let remainingLabel = `${formatMoney(remaining, currency)} left`;
  if (remainingCents < 0) {
    remainingLabel = `${formatMoney(remaining.slice(1), currency)} over`;
  } else if (remainingCents === 0) {
    remainingLabel = "At limit";
  }
  const barColour = status === "over" ? "#9f2d2d" : status === "near" ? "#8c6d2d" : colour;

  return (
    <div className="border-b border-line py-2 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <CategoryIcon name={icon} colour={colour} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="text-xs text-muted">
              {formatMoney(spent, currency)} of {formatMoney(limit, currency)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-sm font-medium ${status === "over" ? "text-danger" : "text-ink"}`}>{remainingLabel}</p>
          <p className={`text-xs ${status === "near" ? "text-gold" : status === "over" ? "text-danger" : "text-muted"}`}>
            {status === "near" ? "Near limit · " : status === "over" ? "Over budget · " : ""}
            {percent}%
          </p>
        </div>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper">
        <div className="h-full rounded-full" style={{ width: `${barWidth(percent)}%`, backgroundColor: barColour }} />
      </div>
    </div>
  );
}
