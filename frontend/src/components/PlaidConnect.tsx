import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlaidLink } from "react-plaid-link";
import type { ReactNode } from "react";
import { api } from "../api/client";

/**
 * Opens Plaid Link. Mount it only when Plaid is configured so Link's script loads once and only
 * when it can work. The public token is exchanged on the server; no credential reaches the browser.
 */
export function PlaidConnect({
  children,
  onResult,
}: {
  children: (props: { open: () => void; ready: boolean; connecting: boolean; error: string }) => ReactNode;
  onResult: (result: { ok: boolean; message: string }) => void;
}) {
  const queryClient = useQueryClient();
  const linkToken = useQuery({ queryKey: ["link-token"], queryFn: api.createLinkToken, retry: false });

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
      exchange.mutate({ token: publicToken, name: metadata.institution?.name || "Bank" });
    },
  });

  return (
    <>
      {children({
        open: () => open(),
        ready: ready && !exchange.isPending,
        connecting: exchange.isPending,
        error: linkToken.error instanceof Error ? linkToken.error.message : "",
      })}
    </>
  );
}
