import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Modal } from "../components/Modal";
import { Button, ErrorText, Field, Notice, controlClass } from "../components/ui";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const [currency, setCurrency] = useState("CAD");
  const [startDay, setStartDay] = useState("1");
  const [notice, setNotice] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (settings.data) {
      setCurrency(settings.data.currency);
      setStartDay(String(settings.data.budget_start_day));
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => api.updateSettings(currency, Number(startDay)),
    onSuccess: async () => {
      setNotice("Settings saved.");
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => setNotice(error.message),
  });
  const loadDemo = useMutation({
    mutationFn: api.loadDemo,
    onSuccess: async (result) => {
      setNotice(result.message);
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => setNotice(error.message),
  });
  const clearDemo = useMutation({
    mutationFn: api.clearDemo,
    onSuccess: async (result) => {
      setConfirmClear(false);
      setNotice(result.message);
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => setNotice(error.message),
  });

  if (settings.isLoading) return <p className="text-sm text-muted">Loading settings…</p>;
  if (settings.error instanceof Error) return <ErrorText>{settings.error.message}</ErrorText>;
  const data = settings.data;
  if (!data) return null;

  const environment = data.plaid_env.charAt(0).toUpperCase() + data.plaid_env.slice(1);

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">Settings</h1>
      {notice && <Notice>{notice}</Notice>}
      <div className="grid items-start gap-3 lg:grid-cols-2">

      <section className="space-y-3 rounded-lg border border-line bg-card p-3 shadow-sm">
        <Field label="Currency">
          <select className={controlClass} value={currency} onChange={(event) => setCurrency(event.target.value)}>
            <option value="CAD">CAD — Canadian dollar</option>
            <option value="USD">USD — US dollar</option>
            <option value="EUR">EUR — Euro</option>
            <option value="GBP">GBP — British pound</option>
          </select>
        </Field>
        <Field label="Monthly budget starts on">
          <input
            className={controlClass}
            type="number"
            min={1}
            max={28}
            value={startDay}
            onChange={(event) => setStartDay(event.target.value)}
          />
        </Field>
        <p className="text-xs text-muted">Day 1 uses the calendar month. A later day starts the budget period on that day.</p>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Save settings
        </Button>
      </section>

      <div className="space-y-3">
      <section className="rounded-lg border border-line bg-card p-3 shadow-sm">
        <h2 className="text-sm font-semibold">Plaid environment</h2>
        <p className="mt-1 text-sm">
          <span className="rounded-md bg-gold-soft px-1.5 py-0.5 text-xs font-medium text-gold">{environment}</span>
        </p>
        <p className="mt-2 text-xs text-muted">
          {data.plaid_configured
            ? "Plaid credentials are set. Connect a bank from Accounts. Sandbox banks are test data."
            : "Plaid is not configured. The app still works with demo data. Add keys to .env when you want a sandbox bank."}
        </p>
      </section>

      <section className="rounded-lg border border-line bg-card p-3 shadow-sm">
        <h2 className="text-sm font-semibold">Demo data</h2>
        <p className="mt-1 text-xs text-muted">
          Loads a chequing account, a $200 Food budget, and a $20 restaurant purchase so $180 remains. It also includes income, a
          transfer, one pending purchase, a category near its limit, and one over budget.
          {data.demo_loaded ? " Demo data is currently loaded." : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => loadDemo.mutate()} disabled={loadDemo.isPending}>
            {loadDemo.isPending ? "Loading…" : "Load demo data"}
          </Button>
          <Button variant="secondary" onClick={() => setConfirmClear(true)}>
            Clear demo data
          </Button>
        </div>
      </section>
      </div>

      </div>
      <Modal open={confirmClear} title="Clear demo data?" onClose={() => setConfirmClear(false)}>
        <p className="text-sm text-muted">
          This removes the demo bank, demo transactions, and demo budgets. Transactions from a real Plaid connection stay.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmClear(false)}>
            Cancel
          </Button>
          <Button variant="danger" disabled={clearDemo.isPending} onClick={() => clearDemo.mutate()}>
            Clear demo data
          </Button>
        </div>
      </Modal>
    </div>
  );
}
