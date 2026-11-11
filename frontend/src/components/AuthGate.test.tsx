import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { AuthGate } from "./AuthGate";

function respond(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function renderGate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthGate>
        <p>Private budgets</p>
      </AuthGate>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("AuthGate", () => {
  it("asks for a new passphrase on first run and checks it locally", async () => {
    const fetchMock = vi.fn(() => respond({ owner_set: false, signed_in: false }));
    vi.stubGlobal("fetch", fetchMock);
    renderGate();
    expect(await screen.findByRole("heading", { name: "Create a passphrase" })).toBeInTheDocument();
    expect(screen.queryByText("Private budgets")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Passphrase/), { target: { value: "long enough phrase" } });
    fireEvent.change(screen.getByLabelText("Confirm passphrase"), { target: { value: "different phrase!!" } });
    fireEvent.click(screen.getByRole("button", { name: "Create passphrase" }));
    expect(await screen.findByText("The two passphrases do not match.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // nothing sent
  });

  it("shows sign-in when a passphrase exists, then the app after signing in", async () => {
    const fetchMock = vi.fn((url: string) =>
      url.endsWith("/login") ? respond({ owner_set: true, signed_in: true }) : respond({ owner_set: true, signed_in: false }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderGate();
    expect(await screen.findByRole("heading", { name: "Sign in to BudgetFlow" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Passphrase/), { target: { value: "correct horse battery staple" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByText("Private budgets")).toBeInTheDocument());
    const [, init] = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/login")) as unknown as [string, RequestInit];
    expect(init.credentials).toBe("same-origin");
  });

  it("returns to sign-in when the API reports an ended session", async () => {
    vi.stubGlobal("fetch", vi.fn(() => respond({ owner_set: true, signed_in: true })));
    renderGate();
    expect(await screen.findByText("Private budgets")).toBeInTheDocument();
    window.dispatchEvent(new Event("budgetflow:signed-out"));
    expect(await screen.findByRole("heading", { name: "Sign in to BudgetFlow" })).toBeInTheDocument();
  });
});
