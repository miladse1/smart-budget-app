import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useState } from "react";
import { api } from "../api/client";
import type { Transaction } from "../api/types";
import { affectsBudget, formatDay, formatFlow } from "../lib/money";
import { CategoryIcon } from "./CategoryIcon";
import { Badge, Sheet, useToast } from "./ui";

/** Bottom sheet for recategorising one transaction. Both affected budgets update at once. */
export function CategorySheet({ txn, currency, onClose }: { txn: Transaction | null; currency: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const categories = useQuery({ queryKey: ["categories"], queryFn: api.categories });
  const [pending, setPending] = useState<number | null>(null);

  const change = useMutation({
    mutationFn: ({ id, categoryId }: { id: number; categoryId: number }) => api.changeCategory(id, categoryId),
    onSuccess: async (updated) => {
      toast("success", `${updated.merchant_name} moved to ${updated.category_name}. Budgets updated.`);
      setPending(null);
      onClose();
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => {
      setPending(null);
      toast("error", error.message);
    },
  });

  if (!txn) return null;
  const flow = formatFlow(txn.amount, currency);

  return (
    <Sheet
      open
      title="Category"
      onClose={onClose}
      description={
        <span className="flex items-center gap-1.5">
          Moving a purchase updates both budgets instantly.
        </span>
      }
    >
      <div className="flex items-center gap-3.5 rounded-[20px] bg-surface-2 p-3.5">
        <CategoryIcon name={txn.category_name} icon={txn.category_icon} colour={txn.category_colour} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold">{txn.merchant_name}</p>
          <p className="truncate text-[13px] text-muted">
            {formatDay(txn.transaction_date, true)} · {txn.account_name}
          </p>
        </div>
        <div className="text-right">
          <p className={`tnum text-[17px] font-semibold ${flow.inflow ? "text-positive" : ""}`}>{flow.text}</p>
          {txn.pending && <Badge tone="warning">Pending</Badge>}
        </div>
      </div>

      <div role="radiogroup" aria-label={`Category for ${txn.merchant_name}`} className="mt-4 grid grid-cols-2 gap-2">
        {(categories.data ?? []).map((category) => {
          const selected = category.id === txn.category_id;
          const saving = pending === category.id;
          return (
            <button
              key={category.id}
              type="button"
              role="radio"
              aria-checked={selected}
              data-autofocus={selected ? true : undefined}
              disabled={change.isPending}
              onClick={() => {
                if (selected) return onClose();
                setPending(category.id);
                change.mutate({ id: txn.id, categoryId: category.id });
              }}
              className={`relative flex min-h-14 items-center gap-2 rounded-[16px] px-2.5 text-left text-[14px] font-semibold transition-[box-shadow,background-color,transform] duration-200 active:scale-[0.98] disabled:cursor-wait ${
                selected ? "bg-surface ring-2 ring-ink" : "bg-surface ring-1 ring-line hover:bg-surface-2"
              } ${saving ? "animate-pulse" : ""}`}
            >
              <CategoryIcon name={category.name} icon={category.icon} colour={category.colour} size="xs" />
              <span className="min-w-0 flex-1 truncate">{category.name}</span>
              {selected && (
                <span aria-hidden="true" className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-surface">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {!affectsBudget(txn.category_name) && (
        <p className="mt-3 text-[13px] text-muted">Income and transfers are kept in your history but are not counted against budgets.</p>
      )}
    </Sheet>
  );
}
