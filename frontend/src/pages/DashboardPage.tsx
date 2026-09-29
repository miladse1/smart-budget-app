import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { BudgetRow } from "../components/BudgetRow";
import { SpendingChart } from "../components/SpendingChart";
import { SummaryCards } from "../components/SummaryCards";
import { Button, ErrorText, Notice, controlClass } from "../components/ui";
import { useBudgetMonth } from "../hooks/useBudgetMonth";
import { affectsBudget, formatFlow, formatMoney, formatWhen } from "../lib/money";

export function DashboardPage() {
  const queryClient = useQueryClient();
  const { year, month, value, setValue, ready, currency, appError } = useBudgetMonth();
  const [accountId, setAccountId] = useState<number | "">("");
  const [notice, setNotice] = useState("");

  const dashboard = useQuery({
    queryKey: ["dashboard", year, month, accountId],
    queryFn: () => api.dashboard(year, month, accountId || undefined),
    enabled: ready,
  });

  const sync = useMutation({
    mutationFn: api.sync,
    onSuccess: async (result) => {
      setNotice(result.message);
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => setNotice(error.message),
  });

  if (appError) {
    return <ErrorText>{appError}</ErrorText>;
  }
  if (!ready || dashboard.isLoading) {
    return <p className="text-sm text-muted">Loading dashboard…</p>;
  }
  if (dashboard.error instanceof Error) {
    return <ErrorText>{dashboard.error.message}</ErrorText>;
  }
  const data = dashboard.data;
  if (!data) {
    return null;
  }

  const selectedAccount = data.accounts.find((account) => account.id === accountId) ?? data.accounts[0];

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-semibold">Dashboard</h1>
        <input
          aria-label="Month"
          type="month"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className={`${controlClass} w-auto`}
        />
        <select
          aria-label="Account"
          value={accountId}
          onChange={(event) => setAccountId(event.target.value ? Number(event.target.value) : "")}
          className={`${controlClass} w-auto max-w-48`}
        >
          <option value="">All accounts</option>
          {data.accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.account_name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted">Synced {formatWhen(data.last_synced_at)}</p>
        <Button onClick={() => sync.mutate()} disabled={sync.isPending}>
          {sync.isPending ? "Syncing…" : "Sync Transactions"}
        </Button>
      </header>

      {notice && <Notice>{notice}</Notice>}

      <SummaryCards summary={data.summary} currency={currency} budgetCount={data.budget_count} />

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.85fr)]">
        <section className="rounded-lg border border-line bg-card px-3 py-2 shadow-sm">
          <div className="flex items-center justify-between py-1">
            <h2 className="text-sm font-semibold">Monthly budgets</h2>
            <Link to={`/budgets?month=${value}`} className="text-xs font-medium text-forest hover:underline">
              View all budgets
            </Link>
          </div>
          {data.budgets.length === 0 ? (
            <p className="py-6 text-sm text-muted">
              No budgets for this month.{" "}
              <Link to="/budgets" className="text-forest hover:underline">
                Create one
              </Link>{" "}
              or load demo data in Settings.
            </p>
          ) : (
            data.budgets.map((budget) => (
              <BudgetRow
                key={budget.id}
                name={budget.name}
                icon={budget.icon}
                colour={budget.colour}
                spent={budget.spent}
                limit={budget.limit_amount}
                currency={currency}
              />
            ))
          )}
        </section>
        <SpendingChart slices={data.spending_by_category} overspending={data.overspending} currency={currency} />
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.85fr)]">
        <section className="rounded-lg border border-line bg-card px-3 py-2 shadow-sm">
          <div className="flex items-center justify-between py-1">
            <h2 className="text-sm font-semibold">Recent transactions</h2>
            <Link to={`/transactions?month=${value}`} className="text-xs font-medium text-forest hover:underline">
              View all transactions
            </Link>
          </div>
          {data.recent_transactions.length === 0 ? (
            <p className="py-6 text-sm text-muted">No transactions in this budget period.</p>
          ) : (
            <ul>
              {data.recent_transactions.map((txn) => {
                const flow = formatFlow(txn.amount, currency);
                return (
                  <li key={txn.id} className="flex items-center justify-between gap-3 border-t border-line py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{txn.merchant_name}</p>
                      <p className="text-xs text-muted">
                        {txn.transaction_date} · {txn.category_name}
                        {txn.pending ? " · Pending" : ""}
                        {!affectsBudget(txn.category_name) ? " · Not in budgets" : ""}
                      </p>
                    </div>
                    <p className={`shrink-0 ${flow.inflow ? "text-forest" : "text-ink"}`}>{flow.text}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-line bg-card p-3 shadow-sm">
          <h2 className="text-sm font-semibold">{selectedAccount ? selectedAccount.account_name : "Accounts"}</h2>
          {selectedAccount ? (
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Current</dt>
                <dd>{selectedAccount.current_balance ? formatMoney(selectedAccount.current_balance, selectedAccount.currency) : "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Available</dt>
                <dd>
                  {selectedAccount.available_balance ? formatMoney(selectedAccount.available_balance, selectedAccount.currency) : "—"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-muted">Connect a bank or load demo data to see a balance.</p>
          )}
          <p className="mt-3 text-sm text-ink">{data.insight}</p>
        </section>
      </div>
    </div>
  );
}
