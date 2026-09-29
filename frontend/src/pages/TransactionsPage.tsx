import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ReceiptText, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { Category, Transaction } from "../api/types";
import { CategoryIcon } from "../components/CategoryIcon";
import { CategorySheet } from "../components/CategorySheet";
import { TransactionRow } from "../components/TransactionRow";
import { Button, Card, EmptyState, ErrorText, MonthSwitcher, PageTitle, Select, Skeleton, control } from "../components/ui";
import { useBudgetMonth } from "../hooks/useBudgetMonth";
import { usePageTitle } from "../hooks/usePageTitle";
import { categoryColour } from "../lib/categories";

const PAGE_SIZE = 20;

function dayHeading(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-CA", { weekday: "long", month: "short", day: "numeric" });
}

function CategoryChips({ categories, value, onChange }: { categories: Category[]; value: string; onChange: (next: string) => void }) {
  const chip = (active: boolean) =>
    `flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] font-semibold whitespace-nowrap transition-colors ${
      active ? "bg-accent text-accent-fg" : "bg-surface text-ink ring-1 ring-inset ring-line hover:bg-surface-2"
    }`;
  return (
    <div role="radiogroup" aria-label="Category filter" className="bf-scroll-x -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
      <button type="button" role="radio" aria-checked={value === ""} onClick={() => onChange("")} className={chip(value === "")}>
        All
      </button>
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          role="radio"
          aria-checked={value === String(category.id)}
          onClick={() => onChange(value === String(category.id) ? "" : String(category.id))}
          className={chip(value === String(category.id))}
        >
          <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: categoryColour(category.name, category.colour) }} />
          {category.name}
        </button>
      ))}
    </div>
  );
}

export function TransactionsPage() {
  usePageTitle("Transactions");
  const { year, month, value, setValue, ready, currency, appError } = useBudgetMonth();
  // Filters live in the URL so a filtered view can be shared and survives reloads.
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "";
  const categoryId = params.get("category") ?? "";
  const accountId = params.get("account") ?? "";
  const [searchInput, setSearchInput] = useState(search);
  const [editing, setEditing] = useState<Transaction | null>(null);

  function updateParams(changes: Record<string, string>) {
    // Read the live URL: React Router's functional updater only sees the last render's params.
    const next = new URLSearchParams(window.location.search);
    for (const [key, val] of Object.entries(changes)) {
      if (val) next.set(key, val);
      else next.delete(key);
    }
    next.delete("page");
    setParams(next, { replace: true });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchInput.trim() !== (new URLSearchParams(window.location.search).get("q") ?? "")) {
        updateParams({ q: searchInput.trim() });
      }
    }, 300);
    return () => window.clearTimeout(timer);
    // updateParams reads the live URL, so it does not need to be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const categories = useQuery({ queryKey: ["categories"], queryFn: api.categories });
  const institutions = useQuery({ queryKey: ["accounts"], queryFn: api.accounts });
  const transactions = useInfiniteQuery({
    queryKey: ["transactions", year, month, search, categoryId, accountId],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.transactions({
        year,
        month,
        page: pageParam,
        pageSize: PAGE_SIZE,
        search,
        categoryId: categoryId ? Number(categoryId) : undefined,
        accountId: accountId ? Number(accountId) : undefined,
      }),
    getNextPageParam: (last) => (last.page * last.page_size < last.total ? last.page + 1 : undefined),
    enabled: ready,
  });

  if (appError) return <ErrorText>{appError}</ErrorText>;

  const categoryList = categories.data ?? [];
  const accounts = (institutions.data ?? []).flatMap((item) => item.accounts);
  const items = transactions.data?.pages.flatMap((page) => page.items) ?? [];
  const total = transactions.data?.pages[0]?.total ?? 0;
  const filtered = Boolean(search || searchInput || categoryId || accountId);
  const groups: { day: string; rows: Transaction[] }[] = [];
  for (const txn of items) {
    const last = groups[groups.length - 1];
    if (last && last.day === txn.transaction_date) last.rows.push(txn);
    else groups.push({ day: txn.transaction_date, rows: [txn] });
  }

  function clearFilters() {
    setSearchInput("");
    updateParams({ q: "", category: "", account: "" });
  }

  const searchBox = (
    <label className="relative block">
      <span className="sr-only">Search merchants</span>
      <Search size={18} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-subtle" />
      <input
        type="search"
        name="search"
        autoComplete="off"
        spellCheck={false}
        placeholder="Search merchants…"
        value={searchInput}
        onChange={(event) => setSearchInput(event.target.value)}
        className={`${control("h-12 w-full rounded-full pr-4 pl-11 text-base")} shadow-card`}
      />
    </label>
  );

  const accountSelect = (full: boolean) =>
    accounts.length > 0 ? (
      <Select
        aria-label="Account filter"
        value={accountId}
        onChange={(event) => updateParams({ account: event.target.value })}
        wrapperClassName={full ? "w-full" : "max-w-52"}
        className="h-10 rounded-full pl-4 text-[14px] font-semibold shadow-card"
      >
        <option value="">All accounts</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.institution_name}, {account.account_name}
          </option>
        ))}
      </Select>
    ) : null;

  const allCategories = [{ id: 0, name: "All categories", icon: "other", colour: "" } as Category, ...categoryList];

  return (
    <div className="grid gap-5">
      <PageTitle title="Transactions" subtitle="Tap a purchase to change its category." />
      <div className="-mt-1 flex flex-wrap items-center gap-2">
        <MonthSwitcher value={value} onChange={setValue} />
        <span className="lg:hidden">{accountSelect(false)}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-12 lg:items-start lg:gap-8">
        <aside aria-label="Filters" className="hidden lg:sticky lg:top-24 lg:col-span-4 lg:grid lg:gap-4">
          {searchBox}
          <Card className="p-2">
            <div role="radiogroup" aria-label="Category filter" className="grid">
              {allCategories.map((category) => {
                const key = category.id ? String(category.id) : "";
                const active = categoryId === key;
                return (
                  <button
                    key={category.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => updateParams({ category: key })}
                    className={`flex h-11 items-center gap-3 rounded-[14px] px-2.5 text-left text-[14px] font-semibold transition-colors ${
                      active ? "bg-accent-soft text-accent-ink" : "hover:bg-surface-2"
                    }`}
                  >
                    {category.id ? (
                      <CategoryIcon name={category.name} icon={category.icon} colour={category.colour} size="sm" />
                    ) : (
                      <span className="grid h-9 w-9 place-items-center rounded-[12px] bg-surface-2 text-muted">
                        <ReceiptText size={16} aria-hidden="true" />
                      </span>
                    )}
                    {category.name}
                  </button>
                );
              })}
            </div>
          </Card>
          {accountSelect(true)}
        </aside>

        <section aria-label="Transaction list" className="grid gap-4 lg:col-span-8">
          <div className="grid gap-3 lg:hidden">
            {searchBox}
            <CategoryChips categories={categoryList} value={categoryId} onChange={(next) => updateParams({ category: next })} />
          </div>

          <div className="flex min-h-9 items-center justify-between gap-3">
            <p className="tnum text-[14px] font-medium text-muted" aria-live="polite">
              {transactions.isLoading ? "Loading…" : `${total} ${total === 1 ? "transaction" : "transactions"}`}
            </p>
            {filtered && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X size={15} aria-hidden="true" />
                Clear filters
              </Button>
            )}
          </div>

          {transactions.error instanceof Error ? (
            <ErrorText onRetry={() => transactions.refetch()}>{transactions.error.message}</ErrorText>
          ) : !ready || transactions.isLoading ? (
            <div aria-busy="true" aria-label="Loading transactions" className="grid gap-2">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-[68px] rounded-[18px]" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <Card>
              <EmptyState
                icon={ReceiptText}
                title={filtered ? "Nothing matches" : "No transactions this month"}
                action={
                  filtered ? (
                    <Button variant="secondary" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              >
                {filtered ? "Try another merchant name, category or account." : "Sync a connected bank, or choose another month."}
              </EmptyState>
            </Card>
          ) : (
            <div className="grid gap-5">
              {groups.map((group) => (
                <section key={group.day} aria-label={dayHeading(group.day)}>
                  <h2 className="mb-2 px-1 text-[13px] font-semibold text-muted">{dayHeading(group.day)}</h2>
                  <ul className="divide-y divide-line overflow-hidden rounded-[20px] bg-surface shadow-card ring-1 ring-line">
                    {group.rows.map((txn) => (
                      <li key={txn.id}>
                        <TransactionRow txn={txn} currency={currency} onOpen={setEditing} showDate={false} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {transactions.hasNextPage && (
                <Button variant="secondary" className="mx-auto" onClick={() => transactions.fetchNextPage()} disabled={transactions.isFetchingNextPage}>
                  {transactions.isFetchingNextPage ? "Loading…" : `Show more (${total - items.length} left)`}
                </Button>
              )}
            </div>
          )}
        </section>
      </div>

      <CategorySheet txn={editing} currency={currency} onClose={() => setEditing(null)} />
    </div>
  );
}
