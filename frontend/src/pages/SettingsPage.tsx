import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, CircleCheck, KeyRound, LogOut, CircleDashed, Database, Download, Link2, Minus, Monitor, Moon, Plus, RotateCcw, Share, SunMedium } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { MIN_PASSPHRASE } from "../components/AuthGate";
import { Badge, Button, Card, ChoiceGroup, ErrorText, Field, PageTitle, Select, Sheet, Skeleton, controlClass, useToast } from "../components/ui";
import { usePageTitle } from "../hooks/usePageTitle";
import { canPromptInstall, isInstalled, isIOS, onInstallChange, promptInstall } from "../lib/install";
import { readTheme, saveTheme, type ThemeChoice } from "../lib/theme";
import { clearOnboardingDraft } from "./OnboardingPage";

function Group({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 px-1 text-[13px] font-semibold text-muted">{title}</h2>
      <Card className="divide-y divide-line overflow-hidden">{children}</Card>
      {footer && <p className="mt-2 px-1 text-[13px] text-muted">{footer}</p>}
    </section>
  );
}

function Row({ icon, title, detail, children }: { icon?: ReactNode; title: string; detail?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-16 items-center gap-3.5 px-4 py-3">
      {icon && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">{title}</p>
        {detail && <div className="mt-0.5 text-[13px] text-pretty text-muted">{detail}</div>}
      </div>
      {children}
    </div>
  );
}

function InstallRow() {
  const toast = useToast();
  const [, force] = useState(0);
  useEffect(() => {
    const stop = onInstallChange(() => force((count) => count + 1));
    return () => {
      stop();
    };
  }, []);
  if (isInstalled()) {
    return <Row icon={<CircleCheck size={17} aria-hidden="true" />} title="Installed" detail="You are using BudgetFlow as an app on this device." />;
  }
  if (canPromptInstall()) {
    return (
      <Row icon={<Download size={17} aria-hidden="true" />} title="Add BudgetFlow to this device" detail="Opens in its own window, with an icon on your home screen or dock.">
        <Button
          size="sm"
          onClick={async () => {
            const accepted = await promptInstall();
            if (accepted) toast("success", "BudgetFlow was added to this device.");
          }}
        >
          Install
        </Button>
      </Row>
    );
  }
  if (isIOS()) {
    return (
      <Row
        icon={<Share size={17} aria-hidden="true" />}
        title="Add to Home Screen"
        detail={
          <>
            In Safari, tap <strong className="font-semibold text-ink">Share</strong>, then <strong className="font-semibold text-ink">Add to Home Screen</strong>. BudgetFlow then
            opens full screen like an app. It is still a web app, not an App Store download.
          </>
        }
      />
    );
  }
  return (
    <Row
      icon={<Download size={17} aria-hidden="true" />}
      title="Install as an app"
      detail="In Chrome or Edge, use the install icon in the address bar. On iPhone, use Safari's Share menu and choose Add to Home Screen."
    />
  );
}

export function SettingsPage() {
  usePageTitle("Settings");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const [currency, setCurrency] = useState("CAD");
  const [startDay, setStartDay] = useState(1);
  const [theme, setTheme] = useState<ThemeChoice>(readTheme);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);

  useEffect(() => {
    if (settings.data) {
      setCurrency(settings.data.currency);
      setStartDay(settings.data.budget_start_day);
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => api.updateSettings(currency, startDay),
    onSuccess: async () => {
      toast("success", "Budget settings saved.");
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast("error", error.message),
  });
  const loadDemo = useMutation({
    mutationFn: api.loadDemo,
    onSuccess: async (result) => {
      toast("success", result.message);
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast("error", error.message),
  });
  const clearDemo = useMutation({
    mutationFn: api.clearDemo,
    onSuccess: async (result) => {
      setConfirmClear(false);
      toast("success", result.message);
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => {
      setConfirmClear(false);
      toast("error", error.message);
    },
  });
  const restart = useMutation({
    mutationFn: () => api.updateOnboarding(false),
    onSuccess: async () => {
      clearOnboardingDraft();
      setConfirmRestart(false);
      await queryClient.invalidateQueries({ queryKey: ["app"] });
      navigate("/welcome", { replace: true });
    },
    onError: (error: Error) => toast("error", error.message),
  });

  if (settings.isLoading) {
    return (
      <div aria-busy="true" aria-label="Loading settings" className="grid gap-5">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-20 rounded-[20px]" />
        <Skeleton className="h-52 rounded-[20px]" />
      </div>
    );
  }
  if (settings.error instanceof Error) return <ErrorText onRetry={() => settings.refetch()}>{settings.error.message}</ErrorText>;
  const data = settings.data;
  if (!data) return null;

  const dirty = currency !== data.currency || startDay !== data.budget_start_day;
  const initials = data.user_name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="grid gap-6">
      <PageTitle title="Settings" />

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start lg:gap-8">
        <div className="grid gap-6">
          <Card className="flex items-center gap-4 p-4">
            <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px] bg-pastel-lavender text-[18px] font-semibold text-pastel-ink">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[17px] font-semibold tracking-[-0.02em]">{data.user_name}</p>
              <p className="truncate text-[14px] text-muted">{data.email}</p>
            </div>
          </Card>

          <Group title="Budget" footer="Day 1 follows the calendar month. A later day starts each budget period on that day, for example your payday.">
            <Row title="Currency">
              <Select name="currency" aria-label="Currency" value={currency} onChange={(event) => setCurrency(event.target.value)} wrapperClassName="w-40" className="h-11 text-[15px]">
                <option value="CAD">CAD, $</option>
                <option value="USD">USD, $</option>
                <option value="EUR">EUR, €</option>
                <option value="GBP">GBP, £</option>
              </Select>
            </Row>
            <Row title="Month starts on day">
              <div className="flex items-center gap-1 rounded-full bg-surface-2 p-1">
                <button
                  type="button"
                  aria-label="Earlier start day"
                  disabled={startDay <= 1}
                  onClick={() => setStartDay((day) => Math.max(1, day - 1))}
                  className="grid h-9 w-9 place-items-center rounded-full bg-surface text-ink shadow-card active:scale-95 disabled:opacity-40"
                >
                  <Minus size={16} aria-hidden="true" />
                </button>
                <output aria-live="polite" aria-label="Budget start day" className="tnum w-9 text-center text-[16px] font-semibold">
                  {startDay}
                </output>
                <button
                  type="button"
                  aria-label="Later start day"
                  disabled={startDay >= 28}
                  onClick={() => setStartDay((day) => Math.min(28, day + 1))}
                  className="grid h-9 w-9 place-items-center rounded-full bg-surface text-ink shadow-card active:scale-95 disabled:opacity-40"
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
            </Row>
            <div className="flex items-center justify-end gap-3 px-4 py-3">
              {!dirty && <span className="text-[13px] text-muted">All changes saved</span>}
              <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
                {save.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </Group>

          <SecurityGroup />

          <Group title="Appearance">
            <div className="p-4">
              <ChoiceGroup
                label="Theme"
                layout="pills"
                value={theme}
                onChange={(next) => {
                  setTheme(next);
                  saveTheme(next);
                }}
                options={[
                  { value: "system", title: "System" },
                  { value: "light", title: "Light" },
                  { value: "dark", title: "Dark" },
                ]}
              />
              <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted">
                {theme === "system" ? <Monitor size={14} aria-hidden="true" /> : theme === "dark" ? <Moon size={14} aria-hidden="true" /> : <SunMedium size={14} aria-hidden="true" />}
                {theme === "system" ? "Follows your device setting." : `Always ${theme} on this device.`}
              </p>
            </div>
          </Group>
        </div>

        <div className="grid gap-6">
          <Group title="Bank connection">
            <Link to="/accounts" className="block transition-colors hover:bg-surface-2/60">
              <Row
                icon={data.plaid_configured ? <CircleCheck size={17} aria-hidden="true" /> : <CircleDashed size={17} aria-hidden="true" />}
                title={data.plaid_configured ? "Plaid is ready" : "Plaid is not set up"}
                detail={data.plaid_configured ? "Connect or manage banks in Accounts." : "Add Plaid keys to the server's .env to connect a bank. Demo data works without them."}
              >
                <Badge tone={data.plaid_env === "production" ? "forest" : "warning"}>
                  <span className="capitalize">{data.plaid_env}</span>
                </Badge>
                <ChevronRight size={17} aria-hidden="true" className="text-subtle" />
              </Row>
            </Link>
          </Group>

          <Group title="Demo data" footer="Demo mode adds a sample chequing account, budgets, income, a transfer and a pending purchase. Clearing it never touches data from a real bank.">
            <Row icon={<Database size={17} aria-hidden="true" />} title="Sample month" detail={data.demo_loaded ? "Loaded and visible across the app." : "Not loaded."}>
              {data.demo_loaded ? <Badge tone="lime">Loaded</Badge> : <Badge>Off</Badge>}
            </Row>
            <div className="flex flex-wrap justify-end gap-2 px-4 py-3">
              <Button variant="dangerQuiet" size="sm" onClick={() => setConfirmClear(true)} disabled={!data.demo_loaded}>
                Clear demo data
              </Button>
              <Button size="sm" variant={data.demo_loaded ? "secondary" : "primary"} onClick={() => loadDemo.mutate()} disabled={loadDemo.isPending}>
                {loadDemo.isPending ? "Loading…" : "Load demo data"}
              </Button>
            </div>
          </Group>

          <Group title="App">
            <InstallRow />
            <button type="button" onClick={() => setConfirmRestart(true)} className="block w-full text-left transition-colors hover:bg-surface-2/60">
              <Row icon={<RotateCcw size={17} aria-hidden="true" />} title="Restart onboarding" detail="Walk through setup again. Your data stays as it is.">
                <ChevronRight size={17} aria-hidden="true" className="text-subtle" />
              </Row>
            </button>
          </Group>

          <p className="flex items-center gap-2 px-1 text-[13px] text-muted">
            <Link2 size={14} aria-hidden="true" />
            BudgetFlow has read-only access and never moves money.
          </p>
        </div>
      </div>

      <Sheet
        open={confirmClear}
        title="Clear demo data?"
        description="This removes the demo bank, demo transactions and demo budgets. Transactions from a real Plaid connection stay."
        onClose={() => setConfirmClear(false)}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setConfirmClear(false)} data-autofocus>
              Cancel
            </Button>
            <Button variant="danger" size="lg" disabled={clearDemo.isPending} onClick={() => clearDemo.mutate()}>
              {clearDemo.isPending ? "Clearing…" : "Clear demo data"}
            </Button>
          </>
        }
      />

      <Sheet
        open={confirmRestart}
        title="Restart onboarding?"
        description="You will go through setup again. Budgets, transactions and connections are kept, and you can change anything along the way."
        onClose={() => setConfirmRestart(false)}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setConfirmRestart(false)} data-autofocus>
              Cancel
            </Button>
            <Button size="lg" disabled={restart.isPending} onClick={() => restart.mutate()}>
              {restart.isPending ? "Starting…" : "Restart setup"}
            </Button>
          </>
        }
      />
    </div>
  );
}

/** Sign out, and change the passphrase (which signs out every other browser). */
function SecurityGroup() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [problem, setProblem] = useState("");

  const signOut = useMutation({
    mutationFn: api.signOut,
    onSuccess: () => {
      // Show sign-in first, then drop every cached budget, account, and transaction.
      queryClient.setQueryData(["auth"], { owner_set: true, signed_in: false });
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
    },
    onError: (error: Error) => toast("error", error.message),
  });
  const change = useMutation({
    mutationFn: () => api.changePassphrase(current, next),
    onSuccess: () => {
      setOpen(false);
      setCurrent("");
      setNext("");
      toast("success", "Passphrase changed. Other browsers were signed out.");
    },
    onError: (error: Error) => setProblem(error.message),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setProblem("");
    if (next.length < MIN_PASSPHRASE) {
      setProblem(`Use at least ${MIN_PASSPHRASE} characters.`);
      return;
    }
    change.mutate();
  }

  return (
    <Group title="Security" footer="You are signed out after an hour without activity, and after 12 hours in any case.">
      <Row icon={<KeyRound size={17} aria-hidden="true" />} title="Passphrase" detail="Changing it signs out every other browser.">
        <Button size="sm" variant="secondary" onClick={() => setOpen((value) => !value)}>
          {open ? "Cancel" : "Change"}
        </Button>
      </Row>
      {open && (
        <form className="grid gap-3 px-4 py-4" onSubmit={onSubmit} noValidate>
          <input type="text" name="username" autoComplete="username" value="BudgetFlow owner" readOnly hidden />
          <Field label="Current passphrase">
            <input type="password" autoComplete="current-password" maxLength={256} value={current} onChange={(event) => setCurrent(event.target.value)} className={controlClass} />
          </Field>
          <Field label="New passphrase" hint={`At least ${MIN_PASSPHRASE} characters.`} error={problem || undefined}>
            <input type="password" autoComplete="new-password" maxLength={256} value={next} onChange={(event) => setNext(event.target.value)} className={controlClass} />
          </Field>
          <div className="flex justify-end">
            <Button size="sm" type="submit" disabled={change.isPending || !current || !next}>
              {change.isPending ? "Saving…" : "Save passphrase"}
            </Button>
          </div>
        </form>
      )}
      <Row icon={<LogOut size={17} aria-hidden="true" />} title="Sign out" detail="Sign in again with your passphrase.">
        <Button size="sm" variant="secondary" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
          Sign out
        </Button>
      </Row>
    </Group>
  );
}
