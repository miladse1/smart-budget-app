import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Dashboard } from "../api/types";
import { formatMoney, toCents } from "../lib/money";

export function SpendingChart({
  slices,
  overspending,
  currency,
}: {
  slices: Dashboard["spending_by_category"];
  overspending: Dashboard["overspending"];
  currency: string;
}) {
  const data = slices
    .filter((slice) => toCents(slice.spent) > 0)
    .map((slice) => ({
      name: slice.name,
      value: toCents(slice.spent),
      colour: slice.colour,
      spent: slice.spent,
    }));

  return (
    <section className="rounded-lg border border-line bg-card p-3 shadow-sm">
      <h2 className="text-sm font-semibold">Spending by category</h2>
      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No expenses this month.</p>
      ) : (
        <>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius={46} outerRadius={66} stroke="#fffcf8" paddingAngle={1}>
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.colour} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(_value, _name, item) => {
                    const spent = (item.payload as { spent?: string } | undefined)?.spent ?? "0";
                    return formatMoney(spent, currency);
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-1">
            {data.map((entry) => (
              <li key={entry.name} className="flex items-center justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.colour }} />
                  <span className="truncate">{entry.name}</span>
                </span>
                <span className="shrink-0">{formatMoney(entry.spent, currency)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {overspending.length > 0 && (
        <p className="mt-3 rounded-md bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
          {overspending.map((item) => `${item.name} is over by ${formatMoney(item.over_amount, currency)}`).join(" · ")}
        </p>
      )}
    </section>
  );
}
