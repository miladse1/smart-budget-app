import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LockKeyhole } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api, SIGNED_OUT_EVENT } from "../api/client";
import { LogoMark } from "./Logo";
import { Button, Callout, Card, Field, controlClass } from "./ui";

export const MIN_PASSPHRASE = 12;

/** Shows first-run passphrase creation or sign-in until the owner has a session. */
export function AuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["auth"], queryFn: api.authStatus, retry: 1 });

  useEffect(() => {
    const onSignedOut = () => {
      queryClient.setQueryData(["auth"], (current: { owner_set: boolean } | undefined) => ({ owner_set: current?.owner_set ?? true, signed_in: false }));
    };
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
  }, [queryClient]);

  if (status.isLoading) {
    return (
      <Screen>
        <p className="sr-only">Loading BudgetFlow…</p>
      </Screen>
    );
  }
  if (status.error instanceof Error || !status.data) {
    return (
      <Screen>
        <p className="mt-5 text-[17px] font-semibold">BudgetFlow cannot reach its server</p>
        <p className="mt-1 max-w-[32ch] text-[14px] text-muted">{status.error instanceof Error ? status.error.message : "Please try again."}</p>
        <Button className="mt-5" onClick={() => status.refetch()}>
          Try again
        </Button>
      </Screen>
    );
  }
  if (!status.data.owner_set) return <PassphraseForm mode="setup" />;
  if (!status.data.signed_in) return <PassphraseForm mode="signin" />;
  return <>{children}</>;
}

function Screen({ children }: { children?: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-6 text-center">
      <div className="flex w-full max-w-sm flex-col items-center">
        <LogoMark size={56} className="bf-scale-in" />
        {children}
      </div>
    </div>
  );
}

function PassphraseForm({ mode }: { mode: "setup" | "signin" }) {
  const queryClient = useQueryClient();
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [problem, setProblem] = useState("");
  const setup = mode === "setup";

  const submit = useMutation({
    mutationFn: () => (setup ? api.createPassphrase(passphrase) : api.signIn(passphrase)),
    onSuccess: async (result) => {
      setPassphrase("");
      setConfirm("");
      queryClient.setQueryData(["auth"], result);
      // Data fetched while signed out failed with 401; load it again.
      await queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
    },
    onError: (error) => setProblem(error instanceof Error ? error.message : "Something went wrong."),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setProblem("");
    if (setup && passphrase.length < MIN_PASSPHRASE) {
      setProblem(`Use at least ${MIN_PASSPHRASE} characters.`);
      return;
    }
    if (setup && passphrase !== confirm) {
      setProblem("The two passphrases do not match.");
      return;
    }
    submit.mutate();
  }

  return (
    <Screen>
      <Card className="mt-6 w-full p-6 text-left">
        <div className="flex items-center gap-2.5">
          <LockKeyhole size={18} aria-hidden="true" className="text-muted" />
          <h1 className="text-[19px] font-semibold tracking-[-0.02em]">{setup ? "Create a passphrase" : "Sign in to BudgetFlow"}</h1>
        </div>
        <p className="mt-1.5 text-[14px] text-pretty text-muted">
          {setup
            ? "Only you can open your budgets and bank data. A few unrelated words make a strong, memorable passphrase."
            : "Enter your passphrase to see your budgets."}
        </p>
        <form className="mt-5 grid gap-4" onSubmit={onSubmit} noValidate>
          {/* Lets password managers file the passphrase under a stable name. */}
          <input type="text" name="username" autoComplete="username" value="BudgetFlow owner" readOnly hidden />
          <Field label="Passphrase" hint={setup ? `At least ${MIN_PASSPHRASE} characters.` : undefined}>
            <input
              type="password"
              name="passphrase"
              autoComplete={setup ? "new-password" : "current-password"}
              autoFocus
              required
              maxLength={256}
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              className={controlClass}
            />
          </Field>
          {setup && (
            <Field label="Confirm passphrase">
              <input
                type="password"
                name="confirm"
                autoComplete="new-password"
                required
                maxLength={256}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className={controlClass}
              />
            </Field>
          )}
          {problem && <Callout tone="error">{problem}</Callout>}
          <Button type="submit" disabled={submit.isPending || !passphrase}>
            {submit.isPending ? "Checking…" : setup ? "Create passphrase" : "Sign in"}
          </Button>
        </form>
      </Card>
      {setup && <p className="mt-4 max-w-[34ch] text-[13px] text-muted">There is no recovery email. If you forget it, see “Reset the passphrase” in the README.</p>}
    </Screen>
  );
}
