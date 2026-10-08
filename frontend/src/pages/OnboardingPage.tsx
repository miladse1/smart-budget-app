import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Database,
  Gauge,
  Landmark,
  LayoutGrid,
  Minus,
  PiggyBank,
  Plus,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Budget, Category, Goal } from "../api/types";
import { CategoryIcon } from "../components/CategoryIcon";
import { LogoMark } from "../components/Logo";
import { PlaidConnect } from "../components/PlaidConnect";
import { WelcomeIllustration } from "../components/WelcomeIllustration";
import { Badge, Button, Callout, ChoiceGroup, Skeleton, control } from "../components/ui";
import { usePageTitle } from "../hooks/usePageTitle";
import { SUGGESTED_BUDGETS } from "../lib/categories";
import { formatMoney, fromCents, toCents } from "../lib/money";

const STORAGE_KEY = "budgetflow.onboarding";
const CURRENCIES = [
  { value: "CAD", title: "CAD $", name: "Canadian dollar" },
  { value: "USD", title: "USD $", name: "US dollar" },
  { value: "EUR", title: "EUR €", name: "Euro" },
  { value: "GBP", title: "GBP £", name: "British pound" },
] as const;

type Draft = { step: number; goal: Goal | null; currency: string; startDay: number; connection: "demo" | "bank" | null };
type Row = { category: Category; enabled: boolean; amount: string; existing?: Budget };

function readDraft(): Partial<Draft> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<Draft>;
  } catch {
    return {};
  }
}

function writeDraft(draft: Draft) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage unavailable: setup still works, it just will not resume mid-way after a refresh.
  }
}

export function clearOnboardingDraft() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

function ordinal(day: number): string {
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${day}${suffix}`;
}

function validAmount(value: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(value.trim()) && Number(value) > 0;
}

const GOALS: { value: Goal; title: string; description: string; icon: ReactNode }[] = [
  { value: "spending", title: "Control my spending", description: "Know what is left before you buy", icon: <Gauge size={21} aria-hidden="true" /> },
  { value: "saving", title: "Save more each month", description: "Find room to set money aside", icon: <PiggyBank size={21} aria-hidden="true" /> },
  { value: "tracking", title: "Track where money goes", description: "Every purchase sorted automatically", icon: <ReceiptText size={21} aria-hidden="true" /> },
  { value: "all", title: "All three", description: "The complete picture", icon: <LayoutGrid size={21} aria-hidden="true" /> },
];

/* ---------------------------------------------------------------- frame */

function StepFrame({
  step,
  onBack,
  onSkip,
  title,
  lead,
  children,
  footer,
}: {
  step: number;
  onBack?: () => void;
  onSkip?: () => void;
  title: string;
  lead?: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="sticky top-0 z-10 bg-canvas/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="flex h-14 items-center gap-2 px-2">
          <div className="w-16">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back"
                className="grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-surface-2 active:scale-95"
              >
                <ArrowLeft size={20} aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="flex flex-1 justify-center gap-1.5" role="progressbar" aria-label="Setup progress" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step}>
            {[1, 2, 3, 4].map((index) => (
              <span key={index} className="h-1.5 w-8 overflow-hidden rounded-full bg-track">
                <span
                  className="block h-full w-full origin-left rounded-full bg-ink transition-transform duration-500 ease-out-soft"
                  style={{ transform: `scaleX(${index <= step ? 1 : 0})` }}
                />
              </span>
            ))}
          </div>
          <div className="flex w-16 justify-end">
            {onSkip && (
              <button type="button" onClick={onSkip} className="h-11 rounded-full px-3 text-[14px] font-semibold text-muted hover:bg-surface-2 hover:text-ink">
                Skip
              </button>
            )}
          </div>
        </div>
      </div>

      <div key={step} className="bf-rise flex-1 px-5 pt-4 pb-6">
        <p className="text-[13px] font-semibold text-accent-ink">Step {step} of 4</p>
        <h1 ref={headingRef} tabIndex={-1} className="mt-1.5 text-[28px] leading-[1.12] font-semibold tracking-[-0.035em] focus:outline-none">
          {title}
        </h1>
        {lead && <p className="mt-2 max-w-[38ch] text-[15px] text-pretty text-muted">{lead}</p>}
        <div className="mt-7">{children}</div>
      </div>

      <div className="sticky bottom-0 bg-gradient-to-t from-canvas from-70% to-canvas/0 px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{footer}</div>
    </div>
  );
}

/* --------------------------------------------------------------- welcome */

function BrandPanel() {
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col justify-between overflow-hidden bg-pastel-yellow p-12 text-pastel-ink lg:flex">
      <div className="flex items-center gap-2.5">
        <LogoMark size={34} />
        <span className="text-[18px] font-semibold tracking-[-0.03em]">BudgetFlow</span>
      </div>
      <WelcomeIllustration className="mx-auto w-full max-w-[460px]" />
      <p className="flex items-center gap-2 text-[14px] text-[#3d3c37]">
        <ShieldCheck size={16} aria-hidden="true" />
        Read-only access. BudgetFlow never moves money.
      </p>
    </aside>
  );
}

/** Headline word set on a pastel pill, like a highlighter mark. */
function Mark({ children, tone }: { children: ReactNode; tone: "lime" | "lavender" | "blush" }) {
  const bg = { lime: "bg-pastel-lime", lavender: "bg-pastel-lavender", blush: "bg-pastel-blush" }[tone];
  return <span className={`mx-[0.04em] inline-block rounded-[0.32em] px-[0.2em] pb-[0.04em] leading-[1.18] ${bg}`}>{children}</span>;
}

/**
 * First screen. Pale-yellow canvas, an original outlined illustration, one headline,
 * one sentence and one action. On large screens it spans the window as a split layout.
 */
function WelcomeStep({ onStart }: { onStart: () => void }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-pastel-yellow text-pastel-ink lg:fixed lg:inset-0 lg:z-10 lg:grid lg:grid-cols-2 lg:items-center lg:gap-12 lg:overflow-y-auto lg:px-[7vw]">
      <div className="flex items-center gap-2 px-6 pt-[calc(env(safe-area-inset-top)+1.25rem)] lg:absolute lg:top-8 lg:left-[7vw] lg:px-0 lg:pt-0">
        <LogoMark size={30} />
        <span className="text-[16px] font-semibold tracking-[-0.03em]">BudgetFlow</span>
      </div>

      <div className="bf-rise px-6 pt-9 lg:px-0 lg:pt-0">
        <h1 className="text-[38px] leading-[1.14] font-semibold tracking-[-0.045em] text-balance sm:text-[44px] lg:text-[60px]">
          See what’s left for{" "}
          <span className="whitespace-nowrap">
            <Mark tone="blush">food</Mark>,
          </span>{" "}
          <Mark tone="lavender">fun</Mark> and{" "}
          <span className="whitespace-nowrap">
            <Mark tone="lime">bills</Mark>.
          </span>
        </h1>
        <p className="mt-4 max-w-[30ch] text-[16px] leading-relaxed text-[#3d3c37] lg:text-[18px]">
          BudgetFlow sorts every purchase and shows how much each budget has left.
        </p>
        <div className="mt-10 hidden lg:block">
          <Button size="lg" onClick={onStart} className="h-14 bg-[#121212] px-8 text-[16px] text-[#fbfaf6] shadow-none hover:bg-[#2a2a2a]">
            Get started
            <ArrowRight size={18} aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-4 lg:py-0">
        <WelcomeIllustration className="w-full max-w-[340px] lg:max-w-[520px]" />
      </div>

      <div className="flex justify-center px-6 pb-[max(1.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <Button size="lg" onClick={onStart} className="h-14 bg-[#121212] px-9 text-[16px] text-[#fbfaf6] shadow-none hover:bg-[#2a2a2a]">
          Get started
          <ArrowRight size={18} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- budgets */

function useBudgetRows(goal: Goal | null, currency: string, active: boolean) {
  const app = useQuery({ queryKey: ["app"], queryFn: api.app });
  const categories = useQuery({ queryKey: ["categories"], queryFn: api.categories });
  const month = app.data?.month ?? 0;
  const year = app.data?.year ?? 0;
  const budgets = useQuery({
    queryKey: ["budgets", year, month],
    queryFn: () => api.budgets(year, month),
    enabled: Boolean(month && year),
  });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fresh, setFresh] = useState(false);
  const { refetch } = budgets;

  // Rows are built from fresh data each time the step opens, so budgets created by
  // demo mode or a bank connection in the previous step count as existing ones.
  useEffect(() => {
    if (!active) {
      setRows(null);
      setFresh(false);
      return;
    }
    if (!month || !year) return;
    let cancelled = false;
    refetch().then(() => {
      if (!cancelled) setFresh(true);
    });
    return () => {
      cancelled = true;
    };
  }, [active, month, year, refetch]);

  useEffect(() => {
    if (!active || !fresh || rows || !categories.data || !budgets.data) return;
    const existing = new Map(budgets.data.map((budget) => [budget.category_id, budget]));
    const chosen = goal ?? "all";
    const next = categories.data
      .filter((category) => category.name !== "Income" && category.name !== "Transfer")
      .map((category) => {
        const current = existing.get(category.id);
        const suggestion = SUGGESTED_BUDGETS[category.name];
        return {
          category,
          existing: current,
          enabled: current ? true : Boolean(suggestion?.goals.includes(chosen)),
          amount: current ? current.limit_amount : (suggestion?.amount ?? "50"),
        };
      })
      .sort((a, b) => Number(b.enabled) - Number(a.enabled));
    setRows(next);
  }, [active, fresh, rows, categories.data, budgets.data, goal]);

  return { rows, setRows, month, year, currency, loading: !rows, error: categories.error ?? budgets.error };
}

/* ------------------------------------------------------------------ page */

export function OnboardingPage() {
  return (
    <div className="bg-canvas text-ink lg:grid lg:min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <BrandPanel />
      <div className="mx-auto w-full max-w-[520px]">
        <OnboardingSteps />
      </div>
    </div>
  );
}

function OnboardingSteps() {
  usePageTitle("Welcome");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const app = useQuery({ queryKey: ["app"], queryFn: api.app });
  const saved = useMemo(readDraft, []);

  const [step, setStep] = useState<number>(Math.min(saved.step ?? 0, 4));
  const [goal, setGoal] = useState<Goal | null>(saved.goal ?? app.data?.goal ?? null);
  const [currency, setCurrency] = useState<string>(saved.currency ?? app.data?.currency ?? "CAD");
  const [startDay, setStartDay] = useState<number>(saved.startDay ?? app.data?.budget_start_day ?? 1);
  const [connection, setConnection] = useState<Draft["connection"]>(saved.connection ?? null);
  const [connectMessage, setConnectMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<{ count: number; total: string } | null>(null);

  useEffect(() => {
    if (step < 5) writeDraft({ step, goal, currency, startDay, connection });
  }, [step, goal, currency, startDay, connection]);

  const saveMoney = useMutation({
    mutationFn: () => api.updateSettings(currency, startDay),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      setError("");
      setStep(3);
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const loadDemo = useMutation({
    mutationFn: api.loadDemo,
    onSuccess: async (result) => {
      setConnection("demo");
      setConnectMessage({ ok: true, text: `Demo data ready: ${result.transactions} transactions and ${result.budgets} budgets.` });
      await queryClient.invalidateQueries();
    },
    onError: (mutationError: Error) => setConnectMessage({ ok: false, text: mutationError.message }),
  });

  const budgetsState = useBudgetRows(goal, currency, step === 4);

  const finish = useMutation({
    mutationFn: async (withBudgets: boolean) => {
      let count = 0;
      let total = 0;
      if (withBudgets && budgetsState.rows) {
        for (const row of budgetsState.rows) {
          if (!row.enabled) continue;
          const amount = row.amount.trim();
          count += 1;
          total += toCents(amount);
          if (row.existing) {
            if (toCents(row.existing.limit_amount) !== toCents(amount)) await api.updateBudget(row.existing.id, amount);
          } else {
            await api.createBudget({ category_id: row.category.id, month: budgetsState.month, year: budgetsState.year, limit_amount: amount });
          }
        }
      }
      await api.updateOnboarding(true, goal ?? undefined);
      return { count, total: fromCents(total) };
    },
    onSuccess: async (result) => {
      setSummary(result);
      clearOnboardingDraft();
      setStep(5);
      await queryClient.invalidateQueries();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const plaidReady = app.data?.plaid_configured ?? false;
  const demoLoaded = app.data?.demo_loaded ?? false;

  // Finished users are sent home; the confirmation step is the one exception.
  if (app.data?.onboarding_completed && step < 5) {
    return <Navigate to="/" replace />;
  }

  if (step === 0) {
    return <WelcomeStep onStart={() => setStep(1)} />;
  }

  if (step === 1) {
    return (
      <StepFrame
        step={1}
        onBack={() => setStep(0)}
        onSkip={() => setStep(2)}
        title="What would you like help with?"
        lead="This shapes the budgets we suggest. You can change them any time."
        footer={
          <Button size="lg" className="w-full" disabled={!goal} onClick={() => setStep(2)}>
            Continue
          </Button>
        }
      >
        <ChoiceGroup label="Your goal" value={goal} onChange={setGoal} options={GOALS} />
      </StepFrame>
    );
  }

  if (step === 2) {
    const example = startDay === 1 ? "Each budget runs for the calendar month." : `Each budget runs from the ${ordinal(startDay)} to the ${ordinal(startDay - 1)} of the next month.`;
    return (
      <StepFrame
        step={2}
        onBack={() => setStep(1)}
        title="Set up your budget month"
        lead="Pick your currency and the day your monthly budget resets."
        footer={
          <Button size="lg" className="w-full" disabled={saveMoney.isPending} onClick={() => saveMoney.mutate()}>
            {saveMoney.isPending ? "Saving…" : "Continue"}
          </Button>
        }
      >
        <div className="grid gap-8">
          <fieldset>
            <legend className="text-[15px] font-semibold">Currency</legend>
            <div className="mt-3">
              <ChoiceGroup
                label="Currency"
                layout="pills"
                value={currency}
                onChange={setCurrency}
                options={CURRENCIES.map((option) => ({ value: option.value, title: option.title }))}
              />
            </div>
            <p className="mt-2.5 text-[13px] text-muted">{CURRENCIES.find((option) => option.value === currency)?.name}</p>
          </fieldset>

          <fieldset>
            <legend className="text-[15px] font-semibold">Budget starts on day</legend>
            <div className="mt-3 flex items-center gap-4 rounded-[20px] bg-surface p-3 ring-1 ring-line">
              <button
                type="button"
                aria-label="Earlier day"
                disabled={startDay <= 1}
                onClick={() => setStartDay((day) => Math.max(1, day - 1))}
                className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-ink hover:bg-surface-3 active:scale-95 disabled:opacity-40"
              >
                <Minus size={20} aria-hidden="true" />
              </button>
              <output aria-live="polite" className="tnum flex-1 text-center text-[34px] font-semibold tracking-[-0.04em]">
                {startDay}
              </output>
              <button
                type="button"
                aria-label="Later day"
                disabled={startDay >= 28}
                onClick={() => setStartDay((day) => Math.min(28, day + 1))}
                className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-ink hover:bg-surface-3 active:scale-95 disabled:opacity-40"
              >
                <Plus size={20} aria-hidden="true" />
              </button>
            </div>
            <p className="mt-2.5 text-[13px] text-muted">{example} Many people pick their payday.</p>
          </fieldset>
          {error && <Callout tone="error">{error}</Callout>}
        </div>
      </StepFrame>
    );
  }

  if (step === 3) {
    return (
      <StepFrame
        step={3}
        onBack={() => setStep(2)}
        onSkip={() => setStep(4)}
        title="Add your transactions"
        lead="Connect a bank to import purchases automatically, or explore with demo data first."
        footer={
          <Button size="lg" className="w-full" onClick={() => setStep(4)}>
            {connection || demoLoaded ? "Continue" : "Continue without data"}
          </Button>
        }
      >
        <div className="grid gap-3">
          <div className={`rounded-[22px] bg-surface p-4 ring-1 ring-line ${plaidReady ? "" : "opacity-90"}`}>
            <div className="flex items-start gap-3.5">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[15px] bg-pastel-blue text-pastel-ink">
                <Landmark size={22} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">
                  Connect your bank
                  {!plaidReady && <Badge>Not set up on this server</Badge>}
                  {plaidReady && app.data?.plaid_env !== "production" && <Badge tone="warning">Sandbox: test banks only</Badge>}
                </p>
                <p className="mt-1 text-[14px] text-muted">Secure sign-in through Plaid. BudgetFlow never sees your password and cannot move money.</p>
              </div>
            </div>
            {plaidReady ? (
              <PlaidConnect
                onResult={(result) => {
                  if (result.ok) setConnection("bank");
                  setConnectMessage({ ok: result.ok, text: result.message });
                }}
              >
                {({ open, ready, connecting, error: linkError }) => (
                  <>
                    <Button className="mt-4 w-full" onClick={open} disabled={!ready}>
                      <ShieldCheck size={17} aria-hidden="true" />
                      {connecting ? "Connecting…" : "Connect with Plaid"}
                    </Button>
                    {linkError && <p className="mt-2 text-[13px] text-danger">{linkError}</p>}
                  </>
                )}
              </PlaidConnect>
            ) : (
              <p className="mt-3 rounded-[14px] bg-surface-2 px-3.5 py-2.5 text-[13px] text-muted">
                The server needs Plaid keys before a bank can be connected. Demo mode works without them.
              </p>
            )}
          </div>

          <div className="rounded-[22px] bg-surface p-4 ring-1 ring-line">
            <div className="flex items-start gap-3.5">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[15px] bg-pastel-lime text-pastel-ink">
                <Database size={22} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">
                  Try demo mode
                  <Badge tone="lime">Sample data</Badge>
                </p>
                <p className="mt-1 text-[14px] text-muted">A sample chequing account with one month of purchases. Clear it any time in Settings.</p>
              </div>
            </div>
            <Button
              variant={connection === "demo" || demoLoaded ? "secondary" : "primary"}
              className="mt-4 w-full"
              disabled={loadDemo.isPending}
              onClick={() => loadDemo.mutate()}
            >
              {loadDemo.isPending ? (
                "Loading demo…"
              ) : connection === "demo" || demoLoaded ? (
                <>
                  <Check size={17} aria-hidden="true" />
                  Demo data loaded
                </>
              ) : (
                "Use demo data"
              )}
            </Button>
          </div>

          {connectMessage && (
            <Callout tone={connectMessage.ok ? "success" : "error"} onDismiss={() => setConnectMessage(null)}>
              {connectMessage.text}
            </Callout>
          )}
        </div>
      </StepFrame>
    );
  }

  if (step === 4) {
    const { rows, setRows, loading } = budgetsState;
    const enabled = (rows ?? []).filter((row) => row.enabled);
    const invalid = enabled.some((row) => !validAmount(row.amount));
    const total = enabled.reduce((sum, row) => sum + (validAmount(row.amount) ? toCents(row.amount) : 0), 0);
    const update = (id: number, change: Partial<Row>) => setRows((all) => (all ? all.map((row) => (row.category.id === id ? { ...row, ...change } : row)) : all));

    return (
      <StepFrame
        step={4}
        onBack={() => setStep(3)}
        onSkip={() => finish.mutate(false)}
        title="Start with these budgets"
        lead="Suggested for your goal. Change any amount or switch a category off."
        footer={
          <div>
            <p className="tnum mb-3 flex items-baseline justify-between text-[14px]">
              <span className="text-muted">
                {enabled.length} {enabled.length === 1 ? "budget" : "budgets"} a month
              </span>
              <span className="text-[17px] font-semibold">{formatMoney(fromCents(total), currency)}</span>
            </p>
            <Button size="lg" className="w-full" disabled={loading || invalid || finish.isPending} onClick={() => finish.mutate(true)}>
              {finish.isPending ? "Saving budgets…" : "Finish setup"}
            </Button>
          </div>
        }
      >
        {budgetsState.error instanceof Error && <Callout tone="error">{budgetsState.error.message}</Callout>}
        {error && (
          <div className="mb-3">
            <Callout tone="error">{error}</Callout>
          </div>
        )}
        {loading ? (
          <div className="grid gap-2">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-16 rounded-[18px]" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-[22px] bg-surface ring-1 ring-line">
            {(rows ?? []).map((row) => {
              const bad = row.enabled && !validAmount(row.amount);
              const inputId = `amount-${row.category.id}`;
              return (
                <li key={row.category.id} className={`flex items-center gap-2.5 px-3 py-3 transition-opacity ${row.enabled ? "" : "opacity-60"}`}>
                  <CategoryIcon name={row.category.name} icon={row.category.icon} colour={row.category.colour} size="sm" />
                  <label htmlFor={`toggle-${row.category.id}`} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block truncate text-[14px] font-semibold">{row.category.name}</span>
                    {row.existing && <span className="block truncate text-[12px] text-muted">Current limit</span>}
                  </label>
                  <div className="relative w-24 shrink-0">
                    <label htmlFor={inputId} className="sr-only">
                      {row.category.name} monthly amount
                    </label>
                    <input
                      id={inputId}
                      name={inputId}
                      inputMode="decimal"
                      autoComplete="off"
                      disabled={!row.enabled}
                      aria-invalid={bad || undefined}
                      value={row.amount}
                      onChange={(event) => update(row.category.id, { amount: event.target.value })}
                      className={`${control("h-11 w-full pr-2.5 pl-6 text-right text-[15px] font-semibold")} tnum`}
                    />
                    <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[14px] text-subtle">
                      {formatMoney("0", currency).replace(/[\d.,]/g, "")}
                    </span>
                  </div>
                  <button
                    id={`toggle-${row.category.id}`}
                    type="button"
                    role="switch"
                    aria-checked={row.enabled}
                    aria-label={`Budget for ${row.category.name}`}
                    onClick={() => update(row.category.id, { enabled: !row.enabled })}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${row.enabled ? "bg-accent" : "bg-line-strong"}`}
                  >
                    <span
                      className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-surface shadow transition-transform duration-200 ease-out-soft ${row.enabled ? "translate-x-5" : ""}`}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {invalid && <p className="mt-3 text-[13px] font-medium text-danger">Enter an amount greater than zero, with up to two decimal places.</p>}
      </StepFrame>
    );
  }

  // Step 5: confirmation.
  const goalTitle = GOALS.find((option) => option.value === goal)?.title;
  return (
    <div className="flex min-h-dvh flex-col px-6 pt-[calc(env(safe-area-inset-top)+3rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-1 flex-col items-center text-center">
        <span className="bf-scale-in grid h-24 w-24 place-items-center rounded-full bg-pastel-lime">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path className="bf-draw" d="M5 12.5l4.5 4.5L19 7.5" stroke="#11200f" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h1 tabIndex={-1} className="mt-7 text-[30px] leading-[1.1] font-semibold tracking-[-0.04em]">
          You are all set
        </h1>
        <p className="mt-2 max-w-[30ch] text-[15px] text-muted">BudgetFlow will subtract each purchase from its category as transactions arrive.</p>

        <dl className="bf-stagger mt-8 w-full max-w-[400px] divide-y divide-line overflow-hidden rounded-[22px] bg-surface text-left text-[15px] ring-1 ring-line">
          {goalTitle && (
            <div className="flex justify-between gap-4 px-4 py-3.5">
              <dt className="text-muted">Goal</dt>
              <dd className="font-semibold">{goalTitle}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4 px-4 py-3.5">
            <dt className="text-muted">Month starts</dt>
            <dd className="font-semibold">{startDay === 1 ? "1st, calendar month" : `The ${ordinal(startDay)}`}</dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-3.5">
            <dt className="text-muted">Budgets</dt>
            <dd className="tnum font-semibold">
              {summary && summary.count > 0 ? `${summary.count}, ${formatMoney(summary.total, currency)} a month` : "None yet"}
            </dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-3.5">
            <dt className="text-muted">Transactions</dt>
            <dd className="font-semibold">{connection === "bank" ? "Bank connected" : connection === "demo" || demoLoaded ? "Demo data" : "Not connected"}</dd>
          </div>
        </dl>
      </div>
      <Button size="lg" className="mt-8 w-full" onClick={() => navigate("/", { replace: true })}>
        Go to Home
      </Button>
    </div>
  );
}
