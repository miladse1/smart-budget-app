import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, PiggyBank, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Budget, Category } from "../api/types";
import { BudgetRow, remainingLabelFor } from "../components/BudgetRow";
import { CategoryIcon } from "../components/CategoryIcon";
import { SpendingChart } from "../components/SpendingChart";
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  Field,
  IconButton,
  MonthSwitcher,
  PageTitle,
  ProgressBar,
  Ring,
  SectionHeader,
  Sheet,
  Skeleton,
  control,
  useToast,
} from "../components/ui";
import { useBudgetMonth } from "../hooks/useBudgetMonth";
import { usePageTitle } from "../hooks/usePageTitle";
import { formatMoney, fromCents, percentUsed, statusFor, toCents } from "../lib/money";

function validLimit(value: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(value.trim()) && Number(value) > 0;
}

const LIMIT_ERROR = "Enter an amount greater than zero, with up to two decimal places.";
const SEVERITY = { over: 0, near: 1, ok: 2 } as const;

function currencySymbol(currency: string): string {
  return formatMoney("0", currency).replace(/[\d.,-]/g, "");
}

function AmountInput({
  value,
  onChange,
  currency,
  label,
  error,
  autoFocus = false,
}: {
  value: string;
  onChange: (next: string) => void;
  currency: string;
  label: string;
  error?: string;
  autoFocus?: boolean;
}) {
  return (
    <Field label={label} error={error}>
      <span className="relative block">
        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[22px] font-semibold text-subtle">
          {currencySymbol(currency)}
        </span>
        <input
          name="limit"
          inputMode="decimal"
          autoComplete="off"
          data-autofocus={autoFocus || undefined}
          aria-invalid={error ? true : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="200.00"
          className={`${control("h-16 w-full pr-4 pl-10 text-[28px] font-semibold tracking-[-0.03em]")} tnum`}
        />
      </span>
    </Field>
  );
}

function Overview({ rows, currency }: { rows: Budget[]; currency: string }) {
  const limit = rows.reduce((sum, row) => sum + toCents(row.limit_amount), 0);
  const spent = rows.reduce((sum, row) => sum + toCents(row.spent), 0);
  const left = limit - spent;
  const percent = percentUsed(fromCents(spent), fromCents(limit));
  const over = rows.filter((row) => statusFor(row.spent, row.limit_amount) === "over").length;
  const near = rows.filter((row) => statusFor(row.spent, row.limit_amount) === "near").length;
  const status = left < 0 ? "over" : percent >= 85 ? "near" : "ok";
  return (
    <section aria-label="Budget overview" className="rounded-[32px] bg-pastel-lavender p-6 text-pastel-ink">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[15px] text-[#121212]/70">{left < 0 ? "Over plan by" : "Left this month"}</p>
          <p className={`tnum mt-1 truncate text-[40px] leading-none font-semibold tracking-[-0.05em] ${left < 0 ? "text-[#a3261e]" : ""}`}>
            {formatMoney(fromCents(Math.abs(left)), currency)}
          </p>
          <p className="tnum mt-2 text-[14px] text-[#121212]/70">
            {formatMoney(fromCents(spent), currency)} of {formatMoney(fromCents(limit), currency)}
          </p>
        </div>
        <Ring percent={percent} status={status} size={76} stroke={8} track="rgb(18 18 18 / 0.12)" ink="#121212" label={`${percent}% of all budgets used`}>
          <span className="tnum text-[15px] font-semibold tracking-[-0.03em]">{percent}%</span>
        </Ring>
      </div>
      <div className="mt-5 flex flex-wrap gap-1.5">
        {over > 0 && <span className="inline-flex h-7 items-center rounded-full bg-pastel-blush px-3 text-[12px] font-semibold">{over} over budget</span>}
        {near > 0 && <span className="inline-flex h-7 items-center rounded-full bg-pastel-yellow px-3 text-[12px] font-semibold">{near} near limit</span>}
        <span className="inline-flex h-7 items-center rounded-full bg-white/70 px-3 text-[12px] font-semibold">{rows.length - over - near} on track</span>
      </div>
    </section>
  );
}

export function BudgetsPage() {
  usePageTitle("Budgets");
  const queryClient = useQueryClient();
  const toast = useToast();
  const { year, month, value, setValue, ready, currency, appError } = useBudgetMonth();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Budget | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [limit, setLimit] = useState("");
  const [formError, setFormError] = useState("");

  const budgets = useQuery({ queryKey: ["budgets", year, month], queryFn: () => api.budgets(year, month), enabled: ready });
  const dashboard = useQuery({ queryKey: ["dashboard", year, month, ""], queryFn: () => api.dashboard(year, month), enabled: ready });
  const categories = useQuery({ queryKey: ["categories"], queryFn: api.categories });

  const refresh = () => queryClient.invalidateQueries();

  const create = useMutation({
    mutationFn: () => api.createBudget({ category_id: Number(categoryId), month, year, limit_amount: limit.trim() }),
    onSuccess: async (budget) => {
      setAdding(false);
      toast("success", `${budget.name} budget added.`);
      await refresh();
    },
    onError: (error: Error) => setFormError(error.message),
  });
  const update = useMutation({
    mutationFn: () => api.updateBudget(selected!.id, limit.trim()),
    onSuccess: async (budget) => {
      setSelected(null);
      toast("success", `${budget.name} limit set to ${formatMoney(budget.limit_amount, currency)}.`);
      await refresh();
    },
    onError: (error: Error) => setFormError(error.message),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteBudget(selected!.id),
    onSuccess: async () => {
      toast("success", `${selected?.name ?? "Budget"} budget deleted.`);
      setSelected(null);
      await refresh();
    },
    onError: (error: Error) => setFormError(error.message),
  });
  const copy = useMutation({
    mutationFn: () => api.copyBudgets(year, month),
    onSuccess: async (result) => {
      toast(result.copied > 0 ? "success" : "info", result.message);
      await refresh();
    },
    onError: (error: Error) => toast("error", error.message),
  });

  if (appError) return <ErrorText>{appError}</ErrorText>;

  const rows = budgets.data ?? [];
  const sorted = [...rows].sort(
    (a, b) => SEVERITY[statusFor(a.spent, a.limit_amount)] - SEVERITY[statusFor(b.spent, b.limit_amount)] || a.name.localeCompare(b.name),
  );
  const used = new Set(rows.map((row) => row.category_id));
  const available: Category[] = (categories.data ?? []).filter(
    (category) => !used.has(category.id) && category.name !== "Income" && category.name !== "Transfer",
  );

  function openAdd() {
    setFormError("");
    setLimit("");
    setCategoryId(available[0]?.id ?? null);
    setAdding(true);
  }

  function openBudget(budget: Budget) {
    setFormError("");
    setConfirmDelete(false);
    setLimit(budget.limit_amount);
    setSelected(budget);
  }

  function submitAdd(event: FormEvent) {
    event.preventDefault();
    if (!categoryId) return setFormError("Choose a category.");
    if (!validLimit(limit)) return setFormError(LIMIT_ERROR);
    setFormError("");
    create.mutate();
  }

  function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!validLimit(limit)) return setFormError(LIMIT_ERROR);
    setFormError("");
    update.mutate();
  }

  const loading = !ready || budgets.isLoading;
  const selectedStatus = selected ? statusFor(selected.spent, selected.limit_amount) : "ok";
  const selectedPercent = selected ? percentUsed(selected.spent, selected.limit_amount) : 0;

  return (
    <div className="grid gap-5">
      <PageTitle
        title="Budgets"
        action={
          <>
            <IconButton label="Copy last month's budgets" tone="filled" onClick={() => copy.mutate()} disabled={copy.isPending || !ready} className="h-11 w-11">
              <Copy size={18} aria-hidden="true" />
            </IconButton>
            <Button onClick={openAdd} disabled={!ready || categories.isLoading || available.length === 0} className="w-11 px-0! lg:w-auto lg:px-5!" aria-label="Add budget">
              <Plus size={20} aria-hidden="true" />
              <span className="hidden lg:inline">Add budget</span>
            </Button>
          </>
        }
      />
      <div className="-mt-1">
        <MonthSwitcher value={value} onChange={setValue} />
      </div>

      {budgets.error instanceof Error ? (
        <ErrorText onRetry={() => budgets.refetch()}>{budgets.error.message}</ErrorText>
      ) : loading ? (
        <div aria-busy="true" aria-label="Loading budgets" className="grid gap-4">
          <Skeleton className="h-36 rounded-[20px]" />
          <Skeleton className="h-96 rounded-[20px]" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={PiggyBank}
            title="No budgets this month"
            action={
              <>
                <Button onClick={openAdd} disabled={available.length === 0}>
                  <Plus size={18} aria-hidden="true" />
                  Add budget
                </Button>
                <Button variant="secondary" onClick={() => copy.mutate()} disabled={copy.isPending}>
                  <Copy size={16} aria-hidden="true" />
                  Copy last month
                </Button>
              </>
            }
          >
            Set a monthly limit for a category. Purchases in it are subtracted automatically.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-12 lg:items-start lg:gap-8">
          <div className="grid gap-6 lg:sticky lg:top-24 lg:order-2 lg:col-span-5">
            <Overview rows={rows} currency={currency} />
            {dashboard.data && (
              <section aria-labelledby="where-title">
                <SectionHeader id="where-title" title="Where it went" />
                <Card className="mt-3 p-5">
                  <SpendingChart stacked slices={dashboard.data.spending_by_category} overspending={dashboard.data.overspending} currency={currency} />
                </Card>
              </section>
            )}
          </div>

          <section aria-labelledby="categories-title" className="lg:order-1 lg:col-span-7">
            <SectionHeader id="categories-title" title={`${rows.length} ${rows.length === 1 ? "category" : "categories"}`} />
            <ul className="bf-stagger mt-3 divide-y divide-line overflow-hidden rounded-[20px] bg-surface shadow-card ring-1 ring-line">
              {sorted.map((budget) => (
                <li key={budget.id}>
                  <BudgetRow
                    name={budget.name}
                    icon={budget.icon}
                    colour={budget.colour}
                    spent={budget.spent}
                    limit={budget.limit_amount}
                    currency={currency}
                    onOpen={() => openBudget(budget)}
                  />
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      <Sheet open={adding} title="New budget" description="Choose a category and a monthly limit." onClose={() => setAdding(false)}>
        <form onSubmit={submitAdd} noValidate className="grid gap-5">
          <div role="radiogroup" aria-label="Category" className="grid grid-cols-2 gap-2">
            {available.map((category) => {
              const active = category.id === categoryId;
              return (
                <button
                  key={category.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setCategoryId(category.id)}
                  className={`flex min-h-14 items-center gap-2 rounded-[16px] bg-surface px-2.5 text-left text-[14px] font-semibold transition-shadow ${
                    active ? "ring-2 ring-ink" : "ring-1 ring-line hover:bg-surface-2"
                  }`}
                >
                  <CategoryIcon name={category.name} icon={category.icon} colour={category.colour} size="xs" />
                  <span className="min-w-0 truncate">{category.name}</span>
                </button>
              );
            })}
          </div>
          <AmountInput label="Monthly limit" value={limit} onChange={setLimit} currency={currency} error={formError} />
          <Button type="submit" size="lg" className="w-full" disabled={create.isPending || available.length === 0}>
            {create.isPending ? "Saving…" : "Save budget"}
          </Button>
        </form>
      </Sheet>

      <Sheet open={selected !== null} title={selected?.name ?? "Budget"} onClose={() => setSelected(null)}>
        {selected && !confirmDelete && (
          <form onSubmit={submitEdit} noValidate className="grid gap-5">
            <div className="rounded-[20px] bg-surface-2 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className={`tnum text-[22px] font-semibold tracking-[-0.03em] ${selectedStatus === "over" ? "text-danger" : ""}`}>
                  {remainingLabelFor(selected.limit_amount, selected.spent, currency)}
                </p>
                <p className="tnum text-[13px] font-medium text-muted">{selectedPercent}% used</p>
              </div>
              <ProgressBar percent={selectedPercent} status={selectedStatus} label={`${selected.name} budget used`} className="mt-3 h-2" />
              <p className="tnum mt-2 text-[13px] text-muted">
                {formatMoney(selected.spent, currency)} spent of {formatMoney(selected.limit_amount, currency)}
              </p>
            </div>
            <AmountInput label="Monthly limit" value={limit} onChange={setLimit} currency={currency} error={formError} />
            <div className="grid gap-2.5">
              <Button type="submit" size="lg" className="w-full" disabled={update.isPending}>
                {update.isPending ? "Saving…" : "Save limit"}
              </Button>
              <Button variant="dangerQuiet" className="w-full" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={16} aria-hidden="true" />
                Delete budget
              </Button>
            </div>
          </form>
        )}
        {selected && confirmDelete && (
          <div className="grid gap-5">
            <p className="text-[15px] text-pretty text-muted">
              {selected.name} will be removed for this month. Transactions stay in your history.
            </p>
            {formError && <p role="alert" className="text-[13px] font-medium text-danger">{formError}</p>}
            <div className="grid gap-2.5">
              <Button variant="danger" size="lg" className="w-full" onClick={() => remove.mutate()} disabled={remove.isPending}>
                {remove.isPending ? "Deleting…" : "Delete budget"}
              </Button>
              <Button variant="secondary" size="lg" className="w-full" onClick={() => setConfirmDelete(false)} data-autofocus>
                Keep it
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
