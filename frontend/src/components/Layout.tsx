import { useQuery } from "@tanstack/react-query";
import { Landmark, LayoutDashboard, Receipt, Settings, Wallet } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { api } from "../api/client";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/budgets", label: "Budgets", icon: Wallet, end: false },
  { to: "/transactions", label: "Transactions", icon: Receipt, end: false },
  { to: "/accounts", label: "Accounts", icon: Landmark, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
];

function Logo() {
  return (
    <div className="flex items-center gap-2 px-2">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-forest text-xs font-semibold text-white">B</span>
      <span className="text-sm font-semibold tracking-tight">BudgetFlow</span>
    </div>
  );
}

function NavItems({ compact = false }: { compact?: boolean }) {
  return (
    <>
      {NAV.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              compact
                ? `flex flex-1 flex-col items-center gap-0.5 py-1 text-[10px] ${isActive ? "text-forest" : "text-muted"}`
                : `flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm ${isActive ? "bg-forest text-white" : "text-ink hover:bg-paper"}`
            }
          >
            <Icon size={compact ? 18 : 16} aria-hidden="true" />
            {item.label}
          </NavLink>
        );
      })}
    </>
  );
}

export function Layout() {
  const appQuery = useQuery({ queryKey: ["app"], queryFn: api.app });
  const environment = appQuery.data?.plaid_env ?? "sandbox";
  const environmentLabel = environment.charAt(0).toUpperCase() + environment.slice(1);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-[1400px]">
        <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r border-line bg-card px-3 py-4 lg:flex">
          <Logo />
          <nav className="mt-5 flex flex-col gap-1" aria-label="Main">
            <NavItems />
          </nav>
          <div className="mt-auto px-2.5 pb-1">
            <p className="text-xs font-medium text-ink">{appQuery.data?.user_name ?? "BudgetFlow"}</p>
            <p className="mt-1 text-xs text-muted">{environmentLabel} · read only</p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 items-center justify-between border-b border-line bg-card px-4 lg:hidden">
            <Logo />
            <p className="text-xs text-muted">{environmentLabel}</p>
          </header>
          <main className="flex-1 px-4 py-4 pb-20 lg:px-5 lg:pb-5">
            <Outlet />
          </main>
        </div>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-card px-1 lg:hidden" aria-label="Main">
        <NavItems compact />
      </nav>
    </div>
  );
}
