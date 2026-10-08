import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlaidLink } from "react-plaid-link";
import type { ReactNode } from "react";
import { api } from "../api/client";

/**
 * Opens Plaid Link. Mount it only when Plaid is configured so Link's script loads once and only
 * when it can work. The browser only ever holds the short-lived Link token and the single-use
 * public token; the public token is exchanged on the server and the access token never leaves it.
 *
 * With `itemId`, Link opens in update mode to repair a connection that needs the person to sign
 * in again (ITEM_LOGIN_REQUIRED). Update mode re-authenticates the existing Item, so nothing is
 * exchanged; the connection is simply synced afterwards.
 */
export function PlaidConnect({
  children,
  onResult,
  itemId,
}: {
  children: (props: { open: () => void; ready: boolean; connecting: boolean; error: string }) => ReactNode;
  onResult: (result: { ok: boolean; message: string }) => void;
  itemId?: number;
}) {
  const queryClient = useQueryClient();
  const linkToken = useQuery({
    queryKey: ["link-token", itemId ?? "new"],
    queryFn: () => (itemId ? api.updateLinkToken(itemId) : api.createLinkToken()),
    retry: false,
    // Link tokens are short-lived; do not keep them around after the button unmounts.
    gcTime: 0,
  });

  const repair = useMutation({
    mutationFn: (id: number) => api.syncItem(id),
    onSuccess: async () => {
      onResult({ ok: true, message: "Bank reconnected. Transactions are syncing." });
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => onResult({ ok: false, message: error.message }),
  });

  const exchange = useMutation({
    mutationFn: ({ token, name }: { token: string; name: string }) => api.exchangePublicToken(token, name),
    onSuccess: async (item) => {
      onResult({ ok: true, message: `${item.institution_name} connected. Transactions are syncing.` });
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => onResult({ ok: false, message: error.message }),
  });

  const { open, ready } = usePlaidLink({
    token: linkToken.data?.link_token ?? null,
    onSuccess: (publicToken, metadata) => {
      if (itemId) {
        repair.mutate(itemId);
        return;
      }
      exchange.mutate({ token: publicToken, name: metadata.institution?.name || "Bank" });
    },
  });

  return (
    <>
      {children({
        open: () => open(),
        ready: ready && !exchange.isPending && !repair.isPending,
        connecting: exchange.isPending || repair.isPending,
        error: linkToken.error instanceof Error ? linkToken.error.message : "",
      })}
    </>
  );
}
