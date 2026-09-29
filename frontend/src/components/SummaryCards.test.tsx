import { render, screen } from "@testing-library/react";
import { SummaryCards } from "./SummaryCards";

describe("SummaryCards", () => {
  it("shows the four dashboard totals", () => {
    render(
      <SummaryCards
        currency="CAD"
        budgetCount={8}
        summary={{
          remaining: "500.50",
          spent: "574.50",
          income: "2450.00",
          total_budget: "1075.00",
        }}
      />,
    );
    expect(screen.getByText("Remaining budget")).toBeInTheDocument();
    expect(screen.getByText("Spent this month")).toBeInTheDocument();
    expect(screen.getByText("Income this month")).toBeInTheDocument();
    expect(screen.getByText("Total monthly budget")).toBeInTheDocument();
    expect(screen.getByText("$500.50")).toBeInTheDocument();
    expect(screen.getByText("$2,450.00")).toBeInTheDocument();
    expect(screen.getByText("8 categories")).toBeInTheDocument();
  });
});
