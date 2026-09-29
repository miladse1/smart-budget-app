/** Cents-based money helpers. Display maths stays out of binary floating point. */

export function toCents(value: string | number): number {
  const raw = String(value).trim().replace(/,/g, "");
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction = ""] = unsigned.split(".");
  const padded = `${fraction}00`.slice(0, 2);
  const extra = fraction.slice(2, 3);
  let cents = Number.parseInt(whole || "0", 10) * 100 + Number.parseInt(padded || "0", 10);
  if (extra && Number.parseInt(extra, 10) >= 5) {
    cents += 1;
  }
  if (Number.isNaN(cents)) {
    return 0;
  }
  return negative ? -cents : cents;
}

export function fromCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${sign}${whole}.${fraction}`;
}

export function remainingAmount(limit: string, spent: string): string {
  return fromCents(toCents(limit) - toCents(spent));
}

export function percentUsed(spent: string, limit: string): number {
  const limitCents = toCents(limit);
  if (limitCents <= 0) {
    return 0;
  }
  return Math.round((toCents(spent) / limitCents) * 100);
}

export function barWidth(percent: number): number {
  return Math.max(0, Math.min(percent, 100));
}

export function statusFor(spent: string, limit: string): "ok" | "near" | "over" {
  const spentCents = toCents(spent);
  const limitCents = toCents(limit);
  if (spentCents > limitCents) {
    return "over";
  }
  if (percentUsed(spent, limit) >= 85) {
    return "near";
  }
  return "ok";
}

export function affectsBudget(categoryName: string): boolean {
  return categoryName !== "Income" && categoryName !== "Transfer";
}

const SYMBOLS: Record<string, string> = {
  CAD: "$",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

export function formatMoney(value: string | number, currency = "CAD"): string {
  const cents = toCents(value);
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / 100).toLocaleString("en-CA");
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${sign}${SYMBOLS[currency] ?? "$"}${whole}.${fraction}`;
}

/** Plaid uses positive amounts for money leaving the account. */
export function formatFlow(value: string, currency = "CAD"): { text: string; inflow: boolean } {
  const cents = toCents(value);
  if (cents < 0) {
    return { text: `+${formatMoney(fromCents(-cents), currency)}`, inflow: true };
  }
  if (cents > 0) {
    return { text: `-${formatMoney(fromCents(cents), currency)}`, inflow: false };
  }
  return { text: formatMoney("0.00", currency), inflow: false };
}

export function formatWhen(value: string | null): string {
  if (!value) {
    return "Not synced yet";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString("en-CA", { month: "long", year: "numeric" });
}
