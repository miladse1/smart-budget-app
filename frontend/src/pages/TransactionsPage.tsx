import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Button, ErrorText, controlClass } from "../components/ui";
import { useBudgetMonth } from "../hooks/useBudgetMonth";
import { affectsBudget, formatFlow } from "../lib/money";

export function TransactionsPage() {
  const queryClient = useQueryClient();
  const { year, month, value, setValue, ready, currency, appError } = useBudgetMonth();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, categoryId, accountId, value]);

  const categories = useQuery({ queryKey: ["categories"], queryFn: api.categories });
  const institutions = useQuery({ queryKey: ["accounts"], queryFn: api.accounts });
  const transactions = useQuery({
    queryKey: ["transactions", year, month, page, search, categoryId, accountId],
    queryFn: () =>
      api.transactions({
        year,
        month,
        page,
        search,
        categoryId: categoryId ? Number(categoryId) : undefined,
        accountId: accountId ? Number(accountId) : undefined,
      }),
    enabled: ready,
  });

  const changeCategory = useMutation({
    mutationFn: ({ id, nextCategory }: { id: number; nextCategory: number }) => api.changeCategory(id, nextCategory),
    onSuccess: async () => {
      setSavingId(null);
      await queryClient.invalidateQueries();
    },
    onError: (mutationError: Error) => {
      setSavingId(null);
      setError(mutationError.message);
    },
  });

  if (appError) return <ErrorText>{appError}</ErrorText>;

  const accounts = (institutions.data ?? []).flatMap((item) => item.accounts);
  const pageCount = Math.max(1, Math.ceil((transactions.data?.total ?? 0) / (transactions.data?.page_size ?? 10)));

  function onCategoryChange(id: number, nextCategory: number) {
    setError("");
    setSavingId(id);
    changeCategory.mutate({ id, nextCategory });
  }

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-semibold">Transactions</h1>
        <input aria-label="Month" type="month" value={value} onChange={(event) => setValue(event.target.value)} className={`${controlClass} w-auto`} />
      </header>

      <div className="grid gap-2 sm:grid-cols-3">
        <input
          aria-label="Search merchants"
          placeholder="Search merchants"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          className={controlClass}
        />
        <select aria-label="Category filter" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={controlClass}>
          <option value="">All categories</option>
          {(categories.data ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select aria-label="Account filter" value={accountId} onChange={(event) => setAccountId(event.target.value)} className={controlClass}>
          <option value="">All accounts</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.institution_name} · {account.account_name}
            </option>
          ))}
        </select>
      </div>
      {error && <ErrorText>{error}</ErrorText>}

      {transactions.isLoading && <p className="text-sm text-muted">Loading transactions…</p>}
      {transactions.error instanceof Error && <ErrorText>{transactions.error.message}</ErrorText>}

      {transactions.data && (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-line bg-card shadow-sm md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Merchant</th>
                  <th className="px-3 py-2 font-medium">Account</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.data.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-muted">
                      No transactions match these filters.
                    </td>
                  </tr>
                )}
                {transactions.data.items.map((txn) => {
                  const flow = formatFlow(txn.amount, currency);
                  return (
                    <tr key={txn.id} className="border-b border-line last:border-b-0">
                      <td className="px-3 py-2 whitespace-nowrap">{txn.transaction_date}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{txn.merchant_name}</p>
                        {!affectsBudget(txn.category_name) && <p className="text-xs text-muted">Not counted in budgets</p>}
                      </td>
                      <td className="px-3 py-2">{txn.account_name}</td>
                      <td className="px-3 py-2">
                        <select
                          aria-label={`Category for ${txn.merchant_name}`}
                          className={controlClass}
                          value={txn.category_id}
                          disabled={savingId === txn.id}
                          onChange={(event) => onCategoryChange(txn.id, Number(event.target.value))}
                        >
                          {(categories.data ?? []).map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">{txn.pending ? "Pending" : "Posted"}</td>
                      <td className={`px-3 py-2 text-right ${flow.inflow ? "text-forest" : ""}`}>{flow.text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 md:hidden">
            {transactions.data.items.length === 0 && <p className="text-sm text-muted">No transactions match these filters.</p>}
            {transactions.data.items.map((txn) => {
              const flow = formatFlow(txn.amount, currency);
              return (
                <article key={txn.id} className="rounded-lg border border-line bg-card p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{txn.merchant_name}</p>
                      <p className="text-xs text-muted">{txn.transaction_date}</p>
                    </div>
                    <p className={`text-sm font-medium ${flow.inflow ? "text-forest" : ""}`}>{flow.text}</p>
                  </div>
                  <dl className="mt-2 space-y-1 text-xs">
                    <div className="flex justify-between gap-3"><dt className="text-muted">Account</dt><dd>{txn.account_name}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted">Status</dt><dd>{txn.pending ? "Pending" : "Posted"}</dd></div>
                  </dl>
                  <label className="mt-2 block text-xs text-muted">
                    Category
                    <select
                      aria-label={`Category for ${txn.merchant_name}`}
                      className={`${controlClass} mt-1`}
                      value={txn.category_id}
                      disabled={savingId === txn.id}
                      onChange={(event) => onCategoryChange(txn.id, Number(event.target.value))}
                    >
                      {(categories.data ?? []).map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!affectsBudget(txn.category_name) && <p className="mt-2 text-xs text-muted">Not counted in budgets</p>}
                </article>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-sm">
            <p className="text-xs text-muted">
              {transactions.data.total} transaction{transactions.data.total === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                Previous
              </Button>
              <span className="text-xs text-muted">
                Page {page} of {pageCount}
              </span>
              <Button variant="secondary" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
