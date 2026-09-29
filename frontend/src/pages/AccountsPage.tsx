import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { api } from "../api/client";
import type { Institution } from "../api/types";
import { Modal } from "../components/Modal";
import { Button, ErrorText, Notice } from "../components/ui";
import { formatMoney, formatWhen } from "../lib/money";

function statusLabel(status: string): string {
  if (status === "active") return "Connected";
  if (status === "demo") return "Demo data";
  if (status === "error") return "Needs attention";
  if (status === "disconnected") return "Disconnected";
  return status;
}

export function AccountsPage() {
  const queryClient = useQueryClient();
  const app = useQuery({ queryKey: ["app"], queryFn: api.app });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: api.accounts });
  const [notice, setNotice] = useState("");
  const [removing, setRemoving] = useState<Institution | null>(null);
  const configured = app.data?.plaid_configured ?? false;

  const linkToken = useQuery({
    queryKey: ["link-token"],
    queryFn: api.createLinkToken,
    enabled: configured,
    retry: false,
  });

  const exchange = useMutation({
    mutationFn: ({ token, name }: { token: string; name: string }) => api.exchangePublicToken(token, name),
    onSuccess: async () => {
      setNotice("Bank connected. BudgetFlow stored the connection on the server and synced transactions.");
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => setNotice(error.message),
  });

  const { open, ready } = usePlaidLink({
    token: linkToken.data?.link_token ?? null,
    onSuccess: (publicToken, metadata) => {
      exchange.mutate({ token: publicToken, name: metadata.institution?.name || "Bank" });
    },
  });

  const sync = useMutation({
    mutationFn: (id: number) => api.syncItem(id),
    onSuccess: async (result) => {
      setNotice(result.message);
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => setNotice(error.message),
  });

  const disconnect = useMutation({
    mutationFn: (id: number) => api.disconnect(id),
    onSuccess: async () => {
      setRemoving(null);
      setNotice("Connection removed. The access token was deleted and transaction history was kept.");
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => setNotice(error.message),
  });

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">Accounts</h1>
          <p className="text-xs text-muted">Bank sign-in happens in Plaid Link. BudgetFlow never asks for your password.</p>
        </div>
        {configured ? (
          <Button onClick={() => open()} disabled={!ready || exchange.isPending}>
            {exchange.isPending ? "Connecting…" : "Connect a bank"}
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={() =>
              setNotice("Plaid credentials are not set. Add PLAID_CLIENT_ID and PLAID_SECRET to .env, then restart the backend. Also set APP_ENCRYPTION_KEY before connecting a bank.")
            }
          >
            Connect a bank
          </Button>
        )}
      </header>

      {notice && <Notice>{notice}</Notice>}
      {linkToken.error instanceof Error && <ErrorText>{linkToken.error.message}</ErrorText>}
      {accounts.error instanceof Error && <ErrorText>{accounts.error.message}</ErrorText>}
      {accounts.isLoading && <p className="text-sm text-muted">Loading accounts…</p>}

      {(accounts.data ?? []).length === 0 && !accounts.isLoading && (
        <p className="rounded-lg border border-line bg-card px-3 py-6 text-sm text-muted shadow-sm">
          No accounts yet. Connect a sandbox bank, or load demo data from Settings.
        </p>
      )}

      <div className="space-y-3">
        {(accounts.data ?? []).map((item) => (
          <section key={item.id} className="rounded-lg border border-line bg-card p-3 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">{item.institution_name}</h2>
                <p className="text-xs text-muted">
                  {statusLabel(item.status)} · Synced {formatWhen(item.last_synced_at)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => sync.mutate(item.id)} disabled={sync.isPending}>
                  Sync
                </Button>
                <Button variant="secondary" onClick={() => setRemoving(item)}>
                  Remove
                </Button>
              </div>
            </div>
            <ul className="mt-2 divide-y divide-line">
              {item.accounts.map((account) => (
                <li key={account.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <p className="font-medium">{account.account_name}</p>
                    <p className="text-xs text-muted">
                      {account.account_subtype || account.account_type}
                      {account.official_name ? ` · ${account.official_name}` : ""}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <p>Current {account.current_balance ? formatMoney(account.current_balance, account.currency) : "—"}</p>
                    <p className="text-muted">
                      Available {account.available_balance ? formatMoney(account.available_balance, account.currency) : "—"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <Modal open={removing !== null} title="Remove this connection?" onClose={() => setRemoving(null)}>
        <p className="text-sm text-muted">
          This deletes the stored Plaid access token for {removing?.institution_name}. Transactions already saved in BudgetFlow stay
          in your history. No money is moved.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRemoving(null)}>
            Cancel
          </Button>
          <Button variant="danger" disabled={disconnect.isPending} onClick={() => removing && disconnect.mutate(removing.id)}>
            Remove connection
          </Button>
        </div>
      </Modal>
    </div>
  );
}
