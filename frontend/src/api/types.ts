/** API types. Money values arrive as decimal strings such as "180.00". */

export interface AppInfo {
  name: string;
  user_name: string;
  plaid_env: string;
  plaid_configured: boolean;
  currency: string;
  budget_start_day: number;
  month: number;
  year: number;
  demo_loaded: boolean;
}

export interface Category {
  id: number;
  name: string;
  colour: string;
  icon: string;
}

export interface Budget {
  id: number;
  category_id: number;
  name: string;
  colour: string;
  icon: string;
  month: number;
  year: number;
  limit_amount: string;
  spent: string;
  remaining: string;
  percent: number;
  status: "ok" | "near" | "over";
  over_amount: string;
}

export interface Transaction {
  id: number;
  transaction_date: string;
  merchant_name: string;
  original_name: string;
  account_id: number;
  account_name: string;
  category_id: number;
  category_name: string;
  category_colour: string;
  category_icon: string;
  amount: string;
  pending: boolean;
  user_overrode_category: boolean;
  affects_budget: boolean;
}

export interface TransactionPage {
  items: Transaction[];
  page: number;
  page_size: number;
  total: number;
}

export interface Account {
  id: number;
  account_name: string;
  official_name: string | null;
  account_type: string;
  account_subtype: string | null;
  current_balance: string | null;
  available_balance: string | null;
  currency: string;
  institution_name: string;
  connection_status: string;
  last_synced_at: string | null;
}

export interface Institution {
  id: number;
  institution_name: string;
  status: string;
  last_synced_at: string | null;
  is_demo: boolean;
  accounts: Account[];
}

export interface Dashboard {
  month: number;
  year: number;
  period_start: string;
  period_end: string;
  currency: string;
  last_synced_at: string | null;
  summary: {
    remaining: string;
    spent: string;
    income: string;
    total_budget: string;
  };
  budgets: Budget[];
  budget_count: number;
  spending_by_category: { name: string; colour: string; spent: string }[];
  overspending: { name: string; colour: string; over_amount: string }[];
  recent_transactions: Transaction[];
  accounts: Account[];
  insight: string;
}

export interface Settings {
  user_name: string;
  email: string;
  currency: string;
  budget_start_day: number;
  plaid_env: string;
  plaid_configured: boolean;
  demo_loaded: boolean;
}

export interface SyncResult {
  synced_items: number;
  added: number;
  modified: number;
  removed: number;
  message: string;
}

export interface DemoResult {
  message: string;
  month: number | null;
  year: number | null;
  transactions: number;
  budgets: number;
}
