import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  getCategoryAverages,
  getMonthlySummary,
  getMonthlyHistory,
  getRecurringExpenses,
} from "../api/client";
import { CATEGORICAL, CHART_INK, STATUS } from "../lib/colors";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatMonthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return new Date(year, mon - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "good" | "bad";
}) {
  const color = tone === "good" ? STATUS.good : tone === "bad" ? STATUS.critical : CHART_INK.primary;
  return (
    <div className="rounded-2xl bg-[#161b22] p-5 text-left shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-[#8b949e]">{label}</p>
      <p className="mt-1 text-2xl font-semibold" style={{ color }}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}

type TypeFilter = "expense" | "income" | "all";

const FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "expense", label: "Expenses" },
  { key: "income", label: "Income" },
  { key: "all", label: "All" },
];

export default function Dashboard() {
  const [month, setMonth] = useState(currentMonth());
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("expense");

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["summary", "monthly", month],
    queryFn: () => getMonthlySummary(month),
  });

  const { data: history } = useQuery({
    queryKey: ["summary", "monthly-history"],
    queryFn: getMonthlyHistory,
  });

  const { data: averages } = useQuery({
    queryKey: ["summary", "category-averages", month, "dashboard"],
    queryFn: () => getCategoryAverages(6, month),
  });

  const { data: recurring } = useQuery({
    queryKey: ["summary", "recurring", "dashboard"],
    queryFn: () => getRecurringExpenses(3),
  });

  // Only average over months that actually have habitual (recurring) income —
  // most of your expense history predates the bank connection, and a one-off
  // windfall like a bonus shouldn't count as "typical" income either.
  const incomeMonths = (history ?? []).filter((h) => h.habitual_income > 0);
  const avgSalary = incomeMonths.length
    ? incomeMonths.reduce((s, h) => s + h.habitual_income, 0) / incomeMonths.length
    : 0;
  const avgNetSaved = incomeMonths.length
    ? incomeMonths.reduce((s, h) => s + (h.habitual_income - h.expenses), 0) / incomeMonths.length
    : 0;

  const averageByCategory = new Map((averages ?? []).map((a) => [a.category_id, a]));

  const categoryData = (summary?.by_category ?? [])
    .filter((c) => typeFilter === "all" || c.kind === typeFilter)
    .map((c) => ({
      ...c,
      deltaPct: averageByCategory.get(c.category_id)?.delta_pct ?? null,
    }));

  const filteredTotal = categoryData.reduce((sum, c) => sum + c.total, 0);

  const spendHistory = (history ?? []).map((h) => ({
    month: formatMonthLabel(h.month),
    rawMonth: h.month,
    expenses: h.expenses,
  }));
  const avgHistoricalExpense = spendHistory.length
    ? spendHistory.reduce((s, h) => s + h.expenses, 0) / spendHistory.length
    : 0;
  const tickInterval = Math.max(0, Math.ceil(spendHistory.length / 14) - 1);

  const fixedTotal = (recurring ?? []).reduce((s, r) => s + r.average_amount, 0);
  const flexibleTotal = Math.max(0, (summary?.expenses ?? 0) - fixedTotal);
  const fixedPct = summary?.expenses ? Math.min(100, (fixedTotal / summary.expenses) * 100) : 0;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-full border-0 bg-[#161b22] px-4 py-2 text-sm text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {summaryLoading && <p className="mt-6 text-sm text-[#8b949e]">Loading...</p>}

      {summary && (
        <>
          <div className="mt-6 grid grid-cols-3 gap-4">
            <StatTile label="Income" value={summary.income} />
            <StatTile label="Expenses" value={summary.expenses} />
            <StatTile
              label="Net"
              value={summary.net}
              tone={summary.net >= 0 ? "good" : "bad"}
            />
          </div>

          <div className="mt-6 rounded-2xl bg-[#161b22] p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Breakdown</h2>
                <p className="mt-0.5 text-xs text-[#8b949e]">
                  Total: <span className="font-medium text-[#c9d1d9]">{formatCurrency(filteredTotal)}</span>
                  {typeFilter === "expense" && (
                    <span className="ml-2 text-[#8b949e]">
                      red = above your 6-month average · green = below
                    </span>
                  )}
                </p>
              </div>
              <div className="flex gap-1 rounded-full bg-[#21262d] p-0.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setTypeFilter(f.key)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      typeFilter === f.key
                        ? "bg-[#30363d] text-emerald-400 shadow-sm"
                        : "text-[#8b949e]"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            {categoryData.length === 0 ? (
              <p className="mt-4 text-sm text-[#8b949e]">Nothing here for this month.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, categoryData.length * 36)}>
                <BarChart data={categoryData} layout="vertical" margin={{ left: 24, top: 12 }}>
                  <CartesianGrid horizontal={false} stroke={CHART_INK.gridline} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => formatCurrency(v)}
                    stroke={CHART_INK.muted}
                    fontSize={12}
                  />
                  <YAxis
                    type="category"
                    dataKey="category_name"
                    width={110}
                    stroke={CHART_INK.muted}
                    fontSize={12}
                  />
                  <Tooltip
                    formatter={(v: number, _n, item) => {
                      const pct = item?.payload?.deltaPct;
                      const suffix =
                        pct != null ? ` (${pct > 0 ? "+" : ""}${pct.toFixed(0)}% vs avg)` : "";
                      return formatCurrency(v) + suffix;
                    }}
                  />
                  <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                    {categoryData.map((c) => {
                      let fill: string = CATEGORICAL[0];
                      if (c.kind === "income") {
                        fill = CATEGORICAL[2];
                      } else if (typeFilter === "expense" && c.deltaPct != null) {
                        if (c.deltaPct > 15) fill = STATUS.critical;
                        else if (c.deltaPct < -15) fill = STATUS.good;
                      }
                      return <Cell key={c.category_name} fill={fill} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.08] p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-400">
                Avg. salary / mo
              </p>
              <p className="mt-1 text-xl font-semibold text-white">
                {formatCurrency(avgSalary)}
              </p>
            </div>
            <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.08] p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-red-400">
                Avg. expenses / mo
              </p>
              <p className="mt-1 text-xl font-semibold text-white">
                {formatCurrency(avgHistoricalExpense)}
              </p>
            </div>
            <div className="rounded-2xl bg-[#161b22] p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-[#8b949e]">
                Avg. net saved / mo
              </p>
              <p
                className="mt-1 text-xl font-semibold"
                style={{ color: avgNetSaved >= 0 ? STATUS.good : STATUS.critical }}
              >
                {formatCurrency(avgNetSaved)}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-[#161b22] p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Spending trend</h2>
                <p className="mt-0.5 text-xs text-[#8b949e]">
                  Every month you have data for — dashed line is your all-time average
                </p>
              </div>
              <p className="text-right text-xs text-[#8b949e]">
                avg <span className="font-semibold text-[#c9d1d9]">{formatCurrency(avgHistoricalExpense)}</span>/mo
              </p>
            </div>
            {spendHistory.length === 0 ? (
              <p className="mt-4 text-sm text-[#8b949e]">No history yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={spendHistory} margin={{ top: 12 }}>
                  <CartesianGrid vertical={false} stroke={CHART_INK.gridline} />
                  <XAxis
                    dataKey="month"
                    stroke={CHART_INK.muted}
                    fontSize={11}
                    interval={tickInterval}
                  />
                  <YAxis
                    tickFormatter={(v) => formatCurrency(v)}
                    stroke={CHART_INK.muted}
                    fontSize={12}
                    width={70}
                  />
                  <ReferenceLine
                    y={avgHistoricalExpense}
                    stroke={CHART_INK.baseline}
                    strokeDasharray="4 4"
                  />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="expenses" radius={[3, 3, 0, 0]}>
                    {spendHistory.map((h) => (
                      <Cell
                        key={h.rawMonth}
                        fill={h.rawMonth === month ? CATEGORICAL[1] : CATEGORICAL[0]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="mt-6 rounded-2xl bg-[#161b22] p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-white">Fixed vs. flexible spending</h2>
            <p className="mt-0.5 text-xs text-[#8b949e]">
              Fixed = your detected recurring bills. Flexible is everything else — the part you
              can actually cut.
            </p>
            <div className="mt-4 flex h-6 overflow-hidden rounded-full bg-[#21262d]">
              <div
                className="h-full"
                style={{ width: `${fixedPct}%`, backgroundColor: CATEGORICAL[6] }}
                title={`Fixed: ${formatCurrency(fixedTotal)}`}
              />
              <div
                className="h-full"
                style={{ width: `${100 - fixedPct}%`, backgroundColor: CATEGORICAL[0] }}
                title={`Flexible: ${formatCurrency(flexibleTotal)}`}
              />
            </div>
            <div className="mt-3 flex items-center gap-6 text-sm">
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: CATEGORICAL[6] }}
                />
                Fixed <span className="font-medium text-white">{formatCurrency(fixedTotal)}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: CATEGORICAL[0] }}
                />
                Flexible{" "}
                <span className="font-medium text-white">{formatCurrency(flexibleTotal)}</span>
              </span>
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-[#161b22] p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-white">Spend by account</h2>
            <div className="mt-3 space-y-2">
              {summary.by_account.map((a) => (
                <div key={a.account_id} className="flex items-center justify-between text-sm">
                  <span className="text-[#c9d1d9]">{a.account_name}</span>
                  <span className="font-medium text-white">{formatCurrency(a.total)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
