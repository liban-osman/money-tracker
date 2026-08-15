export interface Account {
  id: number;
  name: string;
  official_name: string | null;
  type: string;
  subtype: string | null;
  mask: string | null;
  current_balance: number | null;
  available_balance: number | null;
  credit_limit: number | null;
}

export interface Category {
  id: number;
  name: string;
  kind: "income" | "expense" | "transfer";
  color: string | null;
}

export interface Transaction {
  id: number;
  date: string;
  name: string;
  merchant_name: string | null;
  amount: number;
  pending: boolean;
  category: Category | null;
  is_transfer: boolean;
  notes: string | null;
  account: { id: number; name: string; mask: string | null };
  split_share: number | null;
  split_settled: boolean;
  owed_amount: number | null;
  category_overridden: boolean;
}

export interface CategoryBreakdown {
  category_id: number;
  category_name: string;
  kind: string;
  total: number;
}

export interface AccountBreakdown {
  account_id: number;
  account_name: string;
  total: number;
}

export interface MonthlySummary {
  month: string;
  income: number;
  habitual_income: number;
  expenses: number;
  net: number;
  by_category: CategoryBreakdown[];
  by_account: AccountBreakdown[];
}

export interface TrendPoint {
  month: string;
  income: number;
  habitual_income: number;
  expenses: number;
  net: number;
}

export interface SyncResult {
  items: { institution_name: string; added: number; modified: number; removed: number }[];
}

export interface CategoryAverage {
  category_id: number;
  category_name: string;
  kind: string;
  average: number;
  current_month: number;
  delta: number;
  delta_pct: number | null;
}

export interface TopMerchant {
  merchant_name: string;
  total: number;
  count: number;
}

export interface RecurringMerchant {
  merchant_name: string;
  category_name: string | null;
  occurrences: number;
  months_active: number;
  average_amount: number;
  last_amount: number;
  last_date: string;
}

export interface Holding {
  id: number;
  symbol: string;
  name: string | null;
  asset_type: "stock" | "etf" | "crypto" | "cash" | "workplace_rrsp";
  quantity: number;
  average_cost: number | null;
  include_in_net_worth: boolean;
  note: string | null;
  price_cad: number | null;
  market_value_cad: number | null;
  cost_basis_cad: number | null;
  gain_loss_cad: number | null;
  gain_loss_pct: number | null;
  price_unavailable: boolean;
}

export interface NetWorth {
  cash: number;
  liabilities: number;
  investments: number;
  net_worth: number;
  by_account: { account_id: number; account_name: string; type: string; balance: number }[];
  holdings: Holding[];
  excluded_holdings: Holding[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Request to ${path} failed (${res.status})`);
  }
  return res.json();
}

export function fetchHealth(): Promise<{ status: string }> {
  return request("/health");
}

export function createLinkToken(): Promise<{ link_token: string }> {
  return request("/plaid/link-token", { method: "POST" });
}

export function exchangePublicToken(
  publicToken: string,
): Promise<{ item_id: number; institution_name: string; accounts_linked: number }> {
  return request("/plaid/exchange", {
    method: "POST",
    body: JSON.stringify({ public_token: publicToken }),
  });
}

export function listAccounts(): Promise<Account[]> {
  return request("/accounts");
}

export function syncTransactions(): Promise<SyncResult> {
  return request("/plaid/sync", { method: "POST" });
}

export interface ImportCsvResult {
  added: number;
  skipped_duplicate: number;
  skipped_existing: number;
  skipped_invalid: number;
}

export async function importAccountCsv(accountId: number, file: File): Promise<ImportCsvResult> {
  const formData = new FormData();
  formData.append("file", file);
  // No Content-Type header here — the browser sets the multipart boundary itself.
  const res = await fetch(`/api/accounts/${accountId}/import-csv`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `CSV import failed (${res.status})`);
  }
  return res.json();
}

export function listTransactions(params: { month?: string; year?: number } = {}): Promise<Transaction[]> {
  const query = new URLSearchParams();
  if (params.month) query.set("month", params.month);
  else if (params.year) query.set("year", String(params.year));
  const qs = query.toString();
  return request(`/transactions${qs ? `?${qs}` : ""}`);
}

export function updateTransaction(
  id: number,
  body: { category_id?: number; notes?: string; split_share?: number | null; split_settled?: boolean },
): Promise<Transaction> {
  return request(`/transactions/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function listOwedTransactions(): Promise<Transaction[]> {
  return request("/transactions/owed");
}

export function bulkCategorizeTransactions(
  transactionIds: number[],
  categoryId: number,
): Promise<{ updated: number }> {
  return request("/transactions/bulk-categorize", {
    method: "POST",
    body: JSON.stringify({ transaction_ids: transactionIds, category_id: categoryId }),
  });
}

export function listCategories(): Promise<Category[]> {
  return request("/categories");
}

export function getMonthlySummary(month?: string): Promise<MonthlySummary> {
  return request(`/summary/monthly${month ? `?month=${month}` : ""}`);
}

export function getTrend(months = 6, month?: string): Promise<TrendPoint[]> {
  const params = new URLSearchParams({ months: String(months) });
  if (month) params.set("month", month);
  return request(`/summary/trend?${params.toString()}`);
}

export function getCategoryAverages(months = 6, month?: string): Promise<CategoryAverage[]> {
  const params = new URLSearchParams({ months: String(months) });
  if (month) params.set("month", month);
  return request(`/summary/category-averages?${params.toString()}`);
}

export function getTopMerchants(months = 6, month?: string, limit = 8): Promise<TopMerchant[]> {
  const params = new URLSearchParams({ months: String(months), limit: String(limit) });
  if (month) params.set("month", month);
  return request(`/summary/top-merchants?${params.toString()}`);
}

export interface CategoryTrendPoint {
  month: string;
  total: number;
}

export function getCategoryTrend(categoryId: number): Promise<CategoryTrendPoint[]> {
  return request(`/summary/category-trend?category_id=${categoryId}`);
}

export function getMonthlyHistory(): Promise<TrendPoint[]> {
  return request("/summary/monthly-history");
}

export function getRecurringExpenses(minMonths = 3): Promise<RecurringMerchant[]> {
  return request(`/summary/recurring?min_months=${minMonths}`);
}

export function listHoldings(): Promise<Holding[]> {
  return request("/holdings");
}

export function getNetWorth(): Promise<NetWorth> {
  return request("/holdings/net-worth");
}

export function createHolding(body: {
  symbol: string;
  name?: string;
  asset_type: string;
  quantity: number;
  average_cost?: number;
  include_in_net_worth?: boolean;
  note?: string;
}): Promise<Holding> {
  return request("/holdings", { method: "POST", body: JSON.stringify(body) });
}

export function updateHolding(
  id: number,
  body: Partial<{
    symbol: string;
    name: string;
    asset_type: string;
    quantity: number;
    average_cost: number;
    include_in_net_worth: boolean;
    note: string;
  }>,
): Promise<Holding> {
  return request(`/holdings/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteHolding(id: number): Promise<{ deleted: boolean }> {
  return request(`/holdings/${id}`, { method: "DELETE" });
}
