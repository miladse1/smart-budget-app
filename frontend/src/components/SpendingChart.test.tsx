import { render, screen, within } from "@testing-library/react";
import { SpendingChart } from "./SpendingChart";

describe("SpendingChart", () => {
  it("ranks categories by spending and flags overspending", () => {
    render(
      <SpendingChart
        currency="CAD"
        slices={[
          { name: "Food", colour: "#1B4332", spent: "20.00" },
          { name: "Bills", colour: "#3D5A80", spent: "180.00" },
          { name: "Entertainment", colour: "#6B705C", spent: "78.50" },
          { name: "Health", colour: "#9C6644", spent: "0.00" },
        ]}
        overspending={[{ name: "Entertainment", colour: "#6B705C", over_amount: "18.50" }]}
      />,
    );
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((item) => item.textContent?.split("$")[0])).toEqual([
      expect.stringContaining("Bills"),
      expect.stringContaining("Entertainment"),
      expect.stringContaining("Food"),
    ]);
    expect(screen.getByText("Over")).toBeInTheDocument();
    expect(screen.getByText("$278.50")).toBeInTheDocument();
    expect(screen.queryByText("Health")).not.toBeInTheDocument();
  });
});
