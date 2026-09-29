import { render, screen } from "@testing-library/react";
import { BudgetRow } from "./BudgetRow";

describe("BudgetRow", () => {
  it("shows the remaining food budget after a purchase", () => {
    render(
      <BudgetRow name="Food" icon="utensils" colour="#1B4332" spent="20.00" limit="200.00" currency="CAD" />,
    );
    expect(screen.getByText("Food")).toBeInTheDocument();
    expect(screen.getByText("$20.00 of $200.00")).toBeInTheDocument();
    expect(screen.getByText("$180.00 left")).toBeInTheDocument();
    expect(screen.getByText("10%")).toBeInTheDocument();
  });

  it("identifies an over-budget category", () => {
    render(
      <BudgetRow
        name="Entertainment"
        icon="film"
        colour="#6B705C"
        spent="78.50"
        limit="60.00"
        currency="CAD"
      />,
    );
    expect(screen.getByText("$18.50 over")).toBeInTheDocument();
    expect(screen.getByText(/Over budget/)).toBeInTheDocument();
  });
});
