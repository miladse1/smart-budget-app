import { useQuery } from "@tanstack/react-query";
import { Home, Landmark, PiggyBank, ReceiptText, Settings2, ShieldCheck } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../api/client";
import { Logo } from "./Logo";

const NAV = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/budgets", label: "Budgets", icon: PiggyBank, end: false },
  { to: "/transactions", label: "Transactions", icon: ReceiptText, end: false },
  { to: "/accounts", label: "Accounts", icon: Landmark, end: false },
  { to: "/settings", label: "Settings", icon: Settings2, end: false },
];

export function Layout() {
  const location = useLocation();
  const appQuery = useQuery({ queryKey: ["app"], queryFn: api.app });
  const environment = appQuery.data?.plaid_env ?? "sandbox";

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <a
        href="#main"
        className="sr-only rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg focus:not-sr-only focus:fixed focus:top-[calc(env(safe-area-inset-top)+0.5rem)] focus:left-2 focus:z-[60]"
      >
        Skip to content
      </a>

      {/* Desktop and tablet-landscape: top navigation. Phones use the bottom tab bar. */}
      <header className="sticky top-0 z-30 hidden border-b border-line bg-canvas/85 backdrop-blur-xl lg:block">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-8 px-8">
          <NavLink to="/" aria-label="BudgetFlow home" className="rounded-full">
            <Logo />
          </NavLink>
          <nav aria-label="Main" className="flex items-center gap-1">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition-colors ${
                    isActive ? "bg-noir text-noir-ink [:root[data-theme=dark]_&]:bg-pastel-lime [:root[data-theme=dark]_&]:text-pastel-ink" : "text-muted hover:bg-surface-2 hover:text-ink"
                  }`
                }
              >
                <Icon size={17} strokeWidth={2} aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>
          <p className="ml-auto flex items-center gap-1.5 text-[13px] text-muted">
            <ShieldCheck size={15} aria-hidden="true" className="text-accent-ink" />
            Read-only
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-semibold capitalize">{environment}</span>
          </p>
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-[560px] px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(6.5rem+env(safe-area-inset-bottom))] focus:outline-none sm:px-6 md:max-w-[720px] lg:max-w-[1180px] lg:px-8 lg:pt-8 lg:pb-12"
      >
        <div key={location.pathname} className="bf-rise">
          <Outlet />
        </div>
      </main>

      {/*
        Phones: a floating capsule. The current tab expands into a black pill with its label;
        the others are icon-only circles that keep their names for screen readers and tooltips.
      */}
      <nav
        aria-label="Main"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] lg:hidden"
      >
        <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-surface/95 p-1.5 shadow-float ring-1 ring-line backdrop-blur-xl">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              className={({ isActive }) =>
                `flex h-12 items-center justify-center rounded-full text-[14px] font-semibold transition-[background-color,color,padding,transform] duration-300 ease-out-soft active:scale-95 ${
                  isActive
                    ? "gap-2 bg-noir px-4 text-noir-ink [:root[data-theme=dark]_&]:bg-pastel-lime [:root[data-theme=dark]_&]:text-pastel-ink"
                    : "w-12 text-ink hover:bg-surface-2"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} strokeWidth={isActive ? 2.2 : 1.9} aria-hidden="true" />
                  <span className={isActive ? "" : "sr-only"}>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
