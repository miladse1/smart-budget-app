import { ChevronRight } from "lucide-react";
import type { Transaction } from "../api/types";
import { affectsBudget, formatDay, formatFlow } from "../lib/money";
import { CategoryIcon } from "./CategoryIcon";
import { Badge } from "./ui";

export function TransactionRow({
  txn,
  currency,
  onOpen,
  showDate = true,
}: {
  txn: Transaction;
  currency: string;
  onOpen?: (txn: Transaction) => void;
  showDate?: boolean;
}) {
  const flow = formatFlow(txn.amount, currency);
  const meta = [showDate ? formatDay(txn.transaction_date) : null, txn.category_name].filter(Boolean).join(" · ");
  const content = (
    <>
      <CategoryIcon name={txn.category_name} icon={txn.category_icon} colour={txn.category_colour} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
          <span className="truncate">{txn.merchant_name}</span>
          {txn.pending && <Badge tone="warning">Pending</Badge>}
        </p>
        <p className="truncate text-[13px] text-muted">
          {meta}
          {!affectsBudget(txn.category_name) && " · not in budgets"}
        </p>
      </div>
      <p className={`tnum shrink-0 text-[15px] font-semibold ${flow.inflow ? "text-positive" : "text-ink"}`}>{flow.text}</p>
      {onOpen && <ChevronRight size={17} aria-hidden="true" className="-mr-1 shrink-0 text-subtle" />}
    </>
  );
  if (!onOpen) {
    return <div className="flex items-center gap-3.5 px-4 py-3">{content}</div>;
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(txn)}
      aria-label={`${txn.merchant_name}, ${flow.text}, ${txn.category_name}${txn.pending ? ", pending" : ""}. Change category`}
      className="flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-surface-2/60 active:bg-surface-2"
    >
      {content}
    </button>
  );
}
