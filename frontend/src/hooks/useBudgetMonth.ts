import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";

export function useBudgetMonth() {
  const [params, setParams] = useSearchParams();
  const appQuery = useQuery({ queryKey: ["app"], queryFn: api.app });
  const fallback = appQuery.data
    ? `${appQuery.data.year}-${String(appQuery.data.month).padStart(2, "0")}`
    : "";
  const value = params.get("month") || fallback;
  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  function setValue(next: string) {
    // Start from the live URL so a filter written in the same tick is not overwritten.
    const updated = new URLSearchParams(window.location.search);
    updated.set("month", next);
    setParams(updated, { replace: true });
  }

  return {
    year,
    month,
    value,
    setValue,
    ready: Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12,
    currency: appQuery.data?.currency ?? "CAD",
    app: appQuery.data,
    appLoading: appQuery.isLoading,
    appError: appQuery.error instanceof Error ? appQuery.error.message : "",
  };
}
