import { describe, expect, it } from "vitest";
import {
  affectsBudget,
  barWidth,
  formatFlow,
  formatMoney,
  percentUsed,
  remainingAmount,
  statusFor,
  toCents,
} from "./money";

describe("budget money", () => {
  it("turns a $200 food budget and a $20 purchase into $180", () => {
    expect(remainingAmount("200.00", "20.00")).toBe("180.00");
    expect(formatMoney("180.00", "CAD")).toBe("$180.00");
    expect(percentUsed("20.00", "200.00")).toBe(10);
    expect(statusFor("20.00", "200.00")).toBe("ok");
  });

  it("keeps income and transfers out of expense budgets", () => {
    expect(affectsBudget("Income")).toBe(false);
    expect(affectsBudget("Transfer")).toBe(false);
    expect(affectsBudget("Food")).toBe(true);
    expect(formatFlow("-2450.00").text).toBe("+$2,450.00");
    expect(formatFlow("20.00").text).toBe("-$20.00");
  });

  it("marks overspending and caps the progress bar", () => {
    expect(remainingAmount("60.00", "78.50")).toBe("-18.50");
    expect(statusFor("78.50", "60.00")).toBe("over");
    expect(statusFor("132.00", "150.00")).toBe("near");
    expect(percentUsed("78.50", "60.00")).toBe(131);
    expect(barWidth(131)).toBe(100);
    expect(formatMoney("-18.50")).toBe("-$18.50");
  });

  it("reads cents without binary rounding surprises", () => {
    expect(toCents("0.10")).toBe(10);
    expect(toCents("-18.50")).toBe(-1850);
  });
});
