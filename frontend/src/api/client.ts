import type {
  AppInfo,
  Budget,
  Category,
  Dashboard,
  DemoResult,
  Goal,
  Institution,
  Settings,
  SyncResult,
  Transaction,
  TransactionPage,
} from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new Error("Cannot reach the BudgetFlow API. Start the backend on port 8000.");
  }
  if (!response.ok) {
    let detail = "Request failed.";
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") {
        detail = body.detail;
      } else if (Array.isArray(body.detail) && body.detail[0] && typeof body.detail[0] === "object") {
        const first = body.detail[0] as { msg?: string };
        detail = first.msg || "Please check the form and try again.";
      }
    } catch {
      detail = "Request failed.";
    }
    throw new Error(detail);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const api = {
  app: () => request<AppInfo>("/api/app"),
  dashboard: (year: number, month: number, accountId?: number) => {
    const params = new URLSearchParams({ year: String(year), month: String(month) });
    if (accountId) params.set("account_id", String(accountId));
    return request<Dashboard>(`/api/dashboard?${params}`);
  },
  categories: () => request<Category[]>("/api/categories"),
  budgets: (year: number, month: number) =>
    request<Budget[]>(`/api/budgets?year=${year}&month=${month}`),
  createBudget: (body: { category_id: number; month: number; year: number; limit_amount: string }) =>
    request<Budget>("/api/budgets", { method: "POST", body: JSON.stringify(body) }),
  updateBudget: (id: number, limitAmount: string) =>
    request<Budget>(`/api/budgets/${id}`, {
      method: "PUT",
      body: JSON.stringify({ limit_amount: limitAmount }),
    }),
  deleteBudget: (id: number) => request<void>(`/api/budgets/${id}`, { method: "DELETE" }),
  copyBudgets: (year: number, month: number) =>
    request<{ copied: number; message: string }>("/api/budgets/copy", {
      method: "POST",
      body: JSON.stringify({ year, month }),
    }),
  transactions: (query: {
    year: number;
    month: number;
    page: number;
    categoryId?: number;
    accountId?: number;
    search?: string;
    pageSize?: number;
  }) => {
    const params = new URLSearchParams({
      year: String(query.year),
      month: String(query.month),
      page: String(query.page),
      page_size: String(query.pageSize ?? 10),
    });
    if (query.categoryId) params.set("category_id", String(query.categoryId));
    if (query.accountId) params.set("account_id", String(query.accountId));
    if (query.search) params.set("search", query.search);
    return request<TransactionPage>(`/api/transactions?${params}`);
  },
  changeCategory: (id: number, categoryId: number) =>
    request<Transaction>(`/api/transactions/${id}/category`, {
      method: "PATCH",
      body: JSON.stringify({ category_id: categoryId }),
    }),
  accounts: () => request<Institution[]>("/api/accounts"),
  settings: () => request<Settings>("/api/settings"),
  updateSettings: (currency: string, budgetStartDay: number) =>
    request<Settings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ currency, budget_start_day: budgetStartDay }),
    }),
  updateOnboarding: (completed: boolean, goal?: Goal) =>
    request<Settings>("/api/onboarding", {
      method: "PUT",
      body: JSON.stringify(goal ? { completed, goal } : { completed }),
    }),
  createLinkToken: () => request<{ link_token: string; expiration: string | null }>("/api/plaid/link-token", { method: "POST" }),
  exchangePublicToken: (publicToken: string, institutionName: string) =>
    request<Institution>("/api/plaid/exchange", {
      method: "POST",
      body: JSON.stringify({ public_token: publicToken, institution_name: institutionName }),
    }),
  sync: () => request<SyncResult>("/api/plaid/sync", { method: "POST" }),
  syncItem: (id: number) => request<SyncResult>(`/api/plaid/items/${id}/sync`, { method: "POST" }),
  disconnect: (id: number) => request<void>(`/api/plaid/items/${id}`, { method: "DELETE" }),
  loadDemo: () => request<DemoResult>("/api/demo/load", { method: "POST" }),
  clearDemo: () => request<DemoResult>("/api/demo/clear", { method: "POST" }),
};
