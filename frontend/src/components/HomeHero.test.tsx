import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomeHero } from "./HomeHero";

const summary = { remaining: "500.50", spent: "574.50", income: "2450.00", total_budget: "1075.00" };

function renderHero(overrides: Partial<Parameters<typeof HomeHero>[0]> = {}) {
  return render(
    <MemoryRouter>
      <HomeHero
        summary={summary}
        currency="CAD"
        budgetCount={8}
        periodStart="2026-09-01"
        periodEnd="2026-09-30"
        monthLabel="September"
        today={new Date(2026, 8, 29)}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

describe("HomeHero", () => {
  it("shows what is left, progress, and a safe daily amount", () => {
    const { container } = renderHero();
    expect(container.textContent).toContain("Remaining budget $500.50");
    expect(container.textContent).toContain("53% of $1,075.00 used across 8 categories");
    expect(screen.getByText("2 days left")).toBeInTheDocument();
    expect(screen.getByText("$250.25")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Monthly budget used" })).toHaveAttribute("aria-valuenow", "53");
  });

  it("switches to an over-budget state", () => {
    const { container } = renderHero({ summary: { ...summary, remaining: "-18.50", spent: "1093.50" } });
    expect(screen.getByText(/Over budget in September/)).toBeInTheDocument();
    expect(container.textContent).toContain("Remaining budget $18.50");
    expect(screen.getByText("Pause spending until next month")).toBeInTheDocument();
  });

  it("invites a first budget when none exist", () => {
    renderHero({ summary: { remaining: "0.00", spent: "0.00", income: "0.00", total_budget: "0.00" }, budgetCount: 0, today: undefined });
    expect(screen.getByRole("link", { name: /Create a budget/ })).toHaveAttribute("href", "/budgets");
  });
});
