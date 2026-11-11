import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api } from "./api/client";
import { AuthGate } from "./components/AuthGate";
import { Layout } from "./components/Layout";
import { LogoMark } from "./components/Logo";
import { Button, ToastProvider } from "./components/ui";
import { AccountsPage } from "./pages/AccountsPage";
import { BudgetsPage } from "./pages/BudgetsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TransactionsPage } from "./pages/TransactionsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function Splash({ children }: { children?: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-6 text-center">
      <div className="flex flex-col items-center">
        <LogoMark size={56} className="bf-scale-in" />
        {children ?? <p className="sr-only">Loading BudgetFlow…</p>}
      </div>
    </div>
  );
}

/** Sends first-time visitors to setup, and finished users away from it. */
function OnboardingGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const app = useQuery({ queryKey: ["app"], queryFn: api.app });

  if (app.isLoading) return <Splash />;
  if (app.error instanceof Error) {
    return (
      <Splash>
        <p className="mt-5 text-[17px] font-semibold">BudgetFlow cannot reach its server</p>
        <p className="mt-1 max-w-[32ch] text-[14px] text-muted">{app.error.message}</p>
        <Button className="mt-5" onClick={() => app.refetch()}>
          Try again
        </Button>
      </Splash>
    );
  }
  const onboarding = location.pathname.startsWith("/welcome");
  if (app.data && !app.data.onboarding_completed && !onboarding) {
    return <Navigate to="/welcome" replace />;
  }
  return <>{children}</>;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthGate>
        <BrowserRouter>
          <OnboardingGate>
            <Routes>
              <Route path="welcome" element={<OnboardingPage />} />
              <Route element={<Layout />}>
                <Route index element={<DashboardPage />} />
                <Route path="budgets" element={<BudgetsPage />} />
                <Route path="transactions" element={<TransactionsPage />} />
                <Route path="accounts" element={<AccountsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </OnboardingGate>
        </BrowserRouter>
        </AuthGate>
      </ToastProvider>
    </QueryClientProvider>
  );
}
