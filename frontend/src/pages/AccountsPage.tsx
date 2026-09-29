import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Eye, KeyRound, Landmark, Lock, Plus, RefreshCw, Unlink } from "lucide-react";
import { useState } from "react";
import { api } from "../api/client";
import type { Institution } from "../api/types";
import { PlaidConnect } from "../components/PlaidConnect";
import { Badge, Button, Callout, Card, EmptyState, ErrorText, IconButton, PageTitle, SectionHeader, Sheet, Skeleton, useToast } from "../components/ui";
import { usePageTitle } from "../hooks/usePageTitle";
import { formatMoney, formatWhen, fromCents, toCents } from "../lib/money";

function statusLabel(status: string): string {
  if (status === "active") return "Connected";
  if (status === "demo") return "Demo data";
  if (status === "error") return "Needs attention";
  if (status === "disconnected") return "Disconnected";
  return status;
}

function statusTone(status: string): "lime" | "neutral" | "danger" | "warning" {
  if (status === "active") return "lime";
  if (status === "error") return "danger";
  if (status === "disconnected") return "warning";
  return "neutral";
}

function ConnectButton({ configured, compact = false }: { configured: boolean; compact?: boolean }) {
  const toast = useToast();
  if (!configured) return null;
  return (
    <PlaidConnect onResult={(result) => toast(result.ok ? "success" : "error", result.message)}>
      {({ open, ready, connecting, error }) => (
        <>
          <Button onClick={open} disabled={!ready} aria-label="Connect a bank" className={compact ? "w-11 px-0! lg:w-auto lg:px-5!" : ""}>
            <Plus size={19} aria-hidden="true" />
            <span className={compact ? "hidden lg:inline" : ""}>{connecting ? "Connecting…" : "Connect a bank"}</span>
          </Button>
          {error && <span className="sr-only">{error}</span>}
        </>
      )}
    </PlaidConnect>
  );
}

export function AccountsPage() {
  usePageTitle("Accounts");
  const queryClient = useQueryClient();
  const toast = useToast();
  const app = useQuery({ queryKey: ["app"], queryFn: api.app });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: api.accounts });
  const [removing, setRemoving] = useState<Institution | null>(null);
  const configured = app.data?.plaid_configured ?? false;

  const sync = useMutation({
    mutationFn: (id: number) => api.syncItem(id),
    onSuccess: async (result) => {
      toast("success", result.message);
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast("error", error.message),
  });

  const disconnect = useMutation({
    mutationFn: (id: number) => api.disconnect(id),
    onSuccess: async () => {
      setRemoving(null);
      toast("success", "Connection removed. The access token was deleted and your history was kept.");
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => {
      setRemoving(null);
      toast("error", error.message);
    },
  });

  const loadDemo = useMutation({
    mutationFn: api.loadDemo,
    onSuccess: async (result) => {
      toast("success", result.message);
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast("error", error.message),
  });

  const items = accounts.data ?? [];
  const all = items.flatMap((item) => item.accounts);
  const sameCurrency = all.length > 0 && all.every((account) => account.currency === all[0].currency);
  const total = sameCurrency ? all.reduce((sum, account) => sum + toCents(account.current_balance ?? "0"), 0) : null;

  return (
    <div className="grid gap-5">
      <PageTitle title="Accounts" subtitle="Balances from your connected banks." action={<ConnectButton configured={configured} compact />} />

      {!configured && !app.isLoading && (
        <Callout tone="info" title="Bank connections are not set up yet">
          The server needs Plaid keys and an encryption key before a bank can be connected. Demo data works without them.
        </Callout>
      )}

      {accounts.error instanceof Error ? (
        <ErrorText onRetry={() => accounts.refetch()}>{accounts.error.message}</ErrorText>
      ) : accounts.isLoading ? (
        <div aria-busy="true" aria-label="Loading accounts" className="grid gap-4">
          <Skeleton className="h-32 rounded-[28px]" />
          <Skeleton className="h-44 rounded-[20px]" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Landmark}
            title="No accounts yet"
            action={
              <>
                <ConnectButton configured={configured} />
                <Button variant={configured ? "secondary" : "primary"} onClick={() => loadDemo.mutate()} disabled={loadDemo.isPending}>
                  <Database size={17} aria-hidden="true" />
                  {loadDemo.isPending ? "Loading demo…" : "Use demo data"}
                </Button>
              </>
            }
          >
            Connect a bank through Plaid, or explore with a sample account first.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-12 lg:items-start lg:gap-8">
          <div className="grid gap-6 lg:col-span-7">
            {total !== null && (
              <section aria-label="Total balance" className="relative overflow-hidden rounded-[32px] bg-noir p-6 text-noir-ink">
                <div aria-hidden="true" className="pointer-events-none absolute -right-10 -bottom-16 h-40 w-40 rounded-full bg-pastel-lavender/90" />
                <div aria-hidden="true" className="pointer-events-none absolute right-16 -bottom-10 h-24 w-24 rounded-full bg-pastel-lime" />
                <p className="relative text-[15px] text-noir-muted">Total balance</p>
                <p className="tnum relative mt-1.5 text-[40px] leading-none font-semibold tracking-[-0.045em]">{formatMoney(fromCents(total), all[0].currency)}</p>
                <p className="relative mt-3 max-w-[20ch] text-[14px] text-noir-muted">
                  Across {all.length} {all.length === 1 ? "account" : "accounts"} at {items.length} {items.length === 1 ? "bank" : "banks"}
                </p>
              </section>
            )}

            {items.map((item) => (
              <section key={item.id} aria-labelledby={`bank-${item.id}`}>
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-pastel-blue text-pastel-ink">
                    <Landmark size={20} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 id={`bank-${item.id}`} className="flex flex-wrap items-center gap-2 text-[17px] font-semibold tracking-[-0.02em]">
                      <span className="truncate">{item.institution_name}</span>
                      <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                    </h2>
                    <p className="text-[13px] text-muted">Synced {formatWhen(item.last_synced_at)}</p>
                  </div>
                  <IconButton label={`Sync ${item.institution_name}`} tone="filled" onClick={() => sync.mutate(item.id)} disabled={sync.isPending}>
                    <RefreshCw size={17} aria-hidden="true" className={sync.isPending && sync.variables === item.id ? "animate-spin" : ""} />
                  </IconButton>
                  <IconButton label={`Remove ${item.institution_name}`} tone="filled" onClick={() => setRemoving(item)} className="hover:text-danger">
                    <Unlink size={17} aria-hidden="true" />
                  </IconButton>
                </div>
                <ul className="mt-3 divide-y divide-line overflow-hidden rounded-[20px] bg-surface shadow-card ring-1 ring-line">
                  {item.accounts.map((account) => (
                    <li key={account.id} className="flex items-center gap-4 px-4 py-4">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold">{account.account_name}</p>
                        <p className="truncate text-[13px] text-muted capitalize">
                          {account.account_subtype || account.account_type}
                          {account.official_name ? <span className="normal-case"> · {account.official_name}</span> : null}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="tnum text-[18px] font-semibold tracking-[-0.02em]">
                          {account.current_balance ? formatMoney(account.current_balance, account.currency) : "Not reported"}
                        </p>
                        <p className="tnum text-[13px] text-muted">
                          {account.available_balance ? `${formatMoney(account.available_balance, account.currency)} available` : "Available not reported"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <section aria-labelledby="security-title" className="lg:col-span-5">
            <SectionHeader id="security-title" title="How connections work" />
            <Card className="mt-3 divide-y divide-line">
              {[
                { icon: Lock, title: "You sign in with Plaid", text: "Your bank password goes to Plaid, never to BudgetFlow." },
                { icon: KeyRound, title: "Tokens stay on the server", text: "Access tokens are encrypted in the database and never sent to your browser." },
                { icon: Eye, title: "Read-only", text: "BudgetFlow reads transactions and balances. It cannot move money." },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex gap-3.5 p-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-[15px] font-semibold">{title}</p>
                    <p className="mt-0.5 text-[13px] text-muted">{text}</p>
                  </div>
                </div>
              ))}
            </Card>
          </section>
        </div>
      )}

      <Sheet
        open={removing !== null}
        title="Remove this connection?"
        description={`This deletes the stored Plaid access token for ${removing?.institution_name ?? "this bank"}. Transactions already in BudgetFlow stay in your history. No money is moved.`}
        onClose={() => setRemoving(null)}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setRemoving(null)} data-autofocus>
              Cancel
            </Button>
            <Button variant="danger" size="lg" disabled={disconnect.isPending} onClick={() => removing && disconnect.mutate(removing.id)}>
              {disconnect.isPending ? "Removing…" : "Remove connection"}
            </Button>
          </>
        }
      />
    </div>
  );
}
