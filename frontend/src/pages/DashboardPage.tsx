import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, ChevronDown, ChevronRight, Database, Landmark, PiggyBank, ReceiptText, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Dashboard, Transaction } from "../api/types";
import { CategoryIcon } from "../components/CategoryIcon";
import { CategorySheet } from "../components/CategorySheet";
import { HomeHero } from "../components/HomeHero";
import { LogoMark } from "../components/Logo";
import { SpendingChart } from "../components/SpendingChart";
import { Badge, ButtonLink, Card, EmptyState, ErrorText, IconButton, MonthSwitcher, SectionHeader, Skeleton, useToast } from "../components/ui";
import { useBudgetMonth } from "../hooks/useBudgetMonth";
import { usePageTitle } from "../hooks/usePageTitle";
import { formatDay, formatFlow, formatMoney, formatWhen, percentUsed, remainingAmount, statusFor, toCents } from "../lib/money";

function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

/* ------------------------------------------------------------- insight */

type Nudge = { tone: "warning" | "over" | "good"; title: string; detail: string; to: string; action: string };

/**
 * One thing worth acting on: the most overspent budget (the API's insight), otherwise the
 * budget closest to its limit, otherwise the API's positive note.
 */
function pickNudge(data: Dashboard, currency: string, month: string): Nudge | null {
  if (data.overspending.length > 0) {
    return { tone: "over", title: data.insight, detail: "Adjust the limit or slow down in this category.", to: `/budgets?month=${month}`, action: "Review" };
  }
  const near = data.budgets
    .filter((budget) => statusFor(budget.spent, budget.limit_amount) === "near")
    .sort((a, b) => percentUsed(b.spent, b.limit_amount) - percentUsed(a.spent, a.limit_amount))[0];
  if (near) {
    const left = remainingAmount(near.limit_amount, near.spent);
    return {
      tone: "warning",
      title: `${near.name} is at ${percentUsed(near.spent, near.limit_amount)}% of its budget`,
      detail: toCents(left) > 0 ? `${formatMoney(left, currency)} left for the rest of the month.` : "Nothing left for the rest of the month.",
      to: `/budgets?month=${month}`,
      action: "Review",
    };
  }
  if (data.insight && data.budget_count > 0) {
    return { tone: "good", title: data.insight, detail: "Every budget is on track so far.", to: `/budgets?month=${month}`, action: "Budgets" };
  }
  return null;
}

function NudgeCard({ nudge }: { nudge: Nudge }) {
  const tile = { over: "bg-pastel-blush", warning: "bg-pastel-yellow", good: "bg-pastel-lime" }[nudge.tone];
  return (
    <section aria-label="Budget insight" className="relative flex items-center gap-3.5 rounded-[28px] bg-surface p-4 shadow-float ring-1 ring-line">
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-[16px] text-pastel-ink ${tile}`}>
        {nudge.tone === "good" ? <Sparkles size={20} aria-hidden="true" /> : <AlertTriangle size={20} aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-snug font-semibold text-pretty">{nudge.title}</p>
        <p className="mt-0.5 text-[13px] text-muted">{nudge.detail}</p>
      </div>
      <Link
        to={nudge.to}
        className="inline-flex h-10 shrink-0 items-center gap-1 rounded-full bg-noir px-4 text-[13px] font-semibold text-noir-ink transition-transform active:scale-95 [:root[data-theme=dark]_&]:bg-pastel-lime [:root[data-theme=dark]_&]:text-pastel-ink"
      >
        {nudge.action}
        <ChevronRight size={15} aria-hidden="true" />
      </Link>
    </section>
  );
}

/* ------------------------------------------------------ summary cards */

function MiniRing({ percent, label }: { percent: number; label: string }) {
  const size = 46;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(percent, 100));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={label}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#121212" strokeOpacity="0.12" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#121212"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped / 100)}
        className="transition-[stroke-dashoffset] duration-700 ease-out-soft"
      />
    </svg>
  );
}

function SummaryPair({ data, currency }: { data: Dashboard; currency: string }) {
  const budgetUsed = percentUsed(data.summary.spent, data.summary.total_budget);
  const incomeCents = toCents(data.summary.income);
  const incomeUsed = incomeCents > 0 ? Math.round((toCents(data.summary.spent) / incomeCents) * 100) : 0;
  const cards = [
    {
      key: "spent",
      bg: "bg-pastel-lime",
      label: "Spent",
      value: formatMoney(data.summary.spent, currency),
      note: toCents(data.summary.total_budget) > 0 ? `${budgetUsed}% of budget` : "No budget set",
      ring: budgetUsed,
      ringLabel: `${budgetUsed}% of the monthly budget spent`,
    },
    {
      key: "income",
      bg: "bg-pastel-lavender",
      label: "Income",
      value: formatMoney(data.summary.income, currency),
      note: incomeCents > 0 ? `${incomeUsed}% spent so far` : "None this month",
      ring: incomeUsed,
      ringLabel: `${incomeUsed}% of this month's income spent`,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((card) => (
        <div key={card.key} className={`rounded-[28px] p-4 pb-5 text-pastel-ink ${card.bg}`}>
          <MiniRing percent={card.ring} label={card.ringLabel} />
          <p className="tnum mt-6 truncate text-[22px] leading-none font-semibold tracking-[-0.04em]">{card.value}</p>
          <p className="mt-1.5 text-[13px] font-semibold">{card.label}</p>
          <p className="tnum text-[12px] text-[#121212]/60">{card.note}</p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ recent */

function RecentRow({ txn, currency, onOpen }: { txn: Transaction; currency: string; onOpen: (txn: Transaction) => void }) {
  const flow = formatFlow(txn.amount, currency);
  return (
    <button
      type="button"
      onClick={() => onOpen(txn)}
      aria-label={`${txn.merchant_name}, ${flow.text}, ${txn.category_name}${txn.pending ? ", pending" : ""}. Change category`}
      className="flex w-full items-center gap-3.5 rounded-[22px] bg-surface p-3 pr-4 text-left ring-1 ring-line transition-[transform,background-color] duration-200 hover:bg-surface-2/60 active:scale-[0.99]"
    >
      <CategoryIcon name={txn.category_name} icon={txn.category_icon} variant="pastel" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
          <span className="truncate">{txn.merchant_name}</span>
          {txn.pending && <Badge tone="warning">Pending</Badge>}
        </p>
        <p className="truncate text-[13px] text-muted">
          {formatDay(txn.transaction_date)} · {txn.category_name}
        </p>
      </div>
      <p className={`tnum shrink-0 text-[15px] font-semibold ${flow.inflow ? "text-positive" : ""}`}>{flow.text}</p>
    </button>
  );
}

function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your month" className="grid gap-4">
      <Skeleton className="h-20 rounded-[28px]" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-40 rounded-[28px]" />
        <Skeleton className="h-40 rounded-[28px]" />
      </div>
      <Skeleton className="h-52 rounded-[22px]" />
    </div>
  );
}

/* --------------------------------------------------------------- page */

export function DashboardPage() {
  usePageTitle("Home");
  const queryClient = useQueryClient();
  const toast = useToast();
  const { year, month, value, setValue, ready, currency, appError, app } = useBudgetMonth();
  const [accountId, setAccountId] = useState<number | "">("");
  const [editing, setEditing] = useState<Transaction | null>(null);

  const dashboard = useQuery({
    queryKey: ["dashboard", year, month, accountId],
    queryFn: () => api.dashboard(year, month, accountId || undefined),
    enabled: ready,
  });

  const sync = useMutation({
    mutationFn: api.sync,
    onSuccess: async (result) => {
      toast("success", result.message);
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast("error", error.message),
  });

  if (appError) return <ErrorText>{appError}</ErrorText>;

  const data = dashboard.data;
  const monthLabel = ready ? new Date(year, month - 1, 1).toLocaleDateString("en-CA", { month: "long" }) : "";
  const firstName = (app?.user_name ?? "").split(" ")[0];
  const isEmpty = data && data.budget_count === 0 && data.recent_transactions.length === 0 && data.accounts.length === 0;
  const nudge = data ? pickNudge(data, currency, value) : null;

  const heroTop = (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <LogoMark size={40} className="lg:hidden" />
          <div className="min-w-0">
            <p className="text-[13px] text-noir-muted">{greeting()}</p>
            <h1 className="truncate text-[20px] leading-tight font-semibold tracking-[-0.03em]">{firstName ? `Hi, ${firstName}` : "Your month"}</h1>
          </div>
        </div>
        <IconButton
          label={sync.isPending ? "Syncing transactions" : `Sync transactions. Last synced ${formatWhen(data?.last_synced_at ?? null)}`}
          tone="onDarkFilled"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="h-11 w-11"
        >
          <RefreshCw size={18} aria-hidden="true" className={sync.isPending ? "animate-spin" : ""} />
        </IconButton>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <MonthSwitcher value={value} onChange={setValue} tone="dark" />
        {data && data.accounts.length > 1 && (
          <span className="relative inline-flex">
            <select
              aria-label="Account"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value ? Number(event.target.value) : "")}
              className="h-10 max-w-44 cursor-pointer appearance-none rounded-full bg-white/10 pr-9 pl-4 text-[14px] font-semibold text-noir-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-pastel-lime"
            >
              <option value="">All accounts</option>
              {data.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_name}
                </option>
              ))}
            </select>
            <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-noir-muted" />
          </span>
        )}
      </div>
    </>
  );

  const heroBleed =
    "-mx-4 -mt-[calc(var(--safe-top)+1rem)] rounded-b-[36px] px-5 pt-[calc(var(--safe-top)+1.25rem)] sm:mx-0 sm:mt-0 sm:rounded-[32px] sm:px-7 sm:pt-7 lg:px-8 lg:pt-8";

  if (dashboard.error instanceof Error || !data || isEmpty) {
    return (
      <div className="grid gap-6">
        <section className={`bg-noir pb-8 text-noir-ink ${heroBleed}`}>{heroTop}</section>
        {dashboard.error instanceof Error ? (
          <ErrorText onRetry={() => dashboard.refetch()}>{dashboard.error.message}</ErrorText>
        ) : isEmpty ? (
          <Card>
            <EmptyState
              icon={PiggyBank}
              title="Your month starts here"
              action={
                <>
                  <ButtonLink to="/accounts">
                    <Landmark size={17} aria-hidden="true" />
                    Connect a bank
                  </ButtonLink>
                  <ButtonLink to="/settings" variant="secondary">
                    <Database size={17} aria-hidden="true" />
                    Use demo data
                  </ButtonLink>
                </>
              }
            >
              Connect a bank or load demo data, then give each category a monthly limit.
            </EmptyState>
          </Card>
        ) : (
          <HomeSkeleton />
        )}
      </div>
    );
  }

  const recent = data.recent_transactions.slice(0, 3);

  return (
    <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-8">
      <div className="lg:col-span-7">
        <HomeHero
          summary={data.summary}
          currency={currency}
          budgetCount={data.budget_count}
          periodStart={data.period_start}
          periodEnd={data.period_end}
          monthLabel={monthLabel}
          top={heroTop}
          className={`pb-16 ${heroBleed}`}
        />

        <div className="bf-stagger relative -mt-10 grid gap-8 lg:mt-8">
          {nudge ? <NudgeCard nudge={nudge} /> : <div aria-hidden="true" className="h-10" />}

          <div className="lg:hidden">
            <SummaryPair data={data} currency={currency} />
          </div>

          <section aria-labelledby="recent-title">
            <SectionHeader id="recent-title" title="Recent" action={{ to: `/transactions?month=${value}`, label: "See all" }} />
            {recent.length === 0 ? (
              <Card className="mt-3">
                <EmptyState compact icon={ReceiptText} title="No transactions this month">
                  Sync a connected bank, or pick another month.
                </EmptyState>
              </Card>
            ) : (
              <ul className="mt-3 grid gap-2">
                {recent.map((txn) => (
                  <li key={txn.id}>
                    <RecentRow txn={txn} currency={currency} onOpen={setEditing} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* Larger screens use the spare column for the summary cards and the category breakdown. */}
      <div className="hidden lg:col-span-5 lg:grid lg:gap-8">
        <SummaryPair data={data} currency={currency} />
        <section aria-labelledby="where-title">
          <SectionHeader id="where-title" title="Where it went" action={{ to: `/budgets?month=${value}`, label: "Budgets" }} />
          <Card className="mt-3 p-5">
            <SpendingChart stacked slices={data.spending_by_category} overspending={data.overspending} currency={currency} />
          </Card>
          <Link to={`/budgets?month=${value}`} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-accent-ink">
            Manage budgets <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </section>
      </div>

      <CategorySheet txn={editing} currency={currency} onClose={() => setEditing(null)} />
    </div>
  );
}
