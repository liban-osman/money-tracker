import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  CategoryTrendPoint,
  getCategoryAverages,
  getCategoryTrend,
  getMonthlyHistory,
  getRecurringExpenses,
  getTopMerchants,
  getTrend,
  listCategories,
} from "../api/client";
import { CATEGORICAL, CHART_INK, STATUS, UI } from "../lib/colors";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const WINDOWS = [
  { key: "3", label: "3mo" },
  { key: "6", label: "6mo" },
  { key: "12", label: "12mo" },
  { key: "all", label: "All" },
] as const;
type WindowKey = (typeof WINDOWS)[number]["key"];

// Fixed identity -> color, by name, so a category's slice color never shifts
// just because the window changed which categories rank on top.
const CATEGORY_COLOR: Record<string, string> = {
  Dining: CATEGORICAL[0],
  Groceries: CATEGORICAL[1],
  "Monthly Bills": CATEGORICAL[2],
  Shopping: CATEGORICAL[3],
  "Travel/Transportation": CATEGORICAL[4],
  Entertainment: CATEGORICAL[5],
  Donations: CATEGORICAL[6],
  Medical: CATEGORICAL[7],
};

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function DeltaChip({ pct, kind }: { pct: number | null; kind: string }) {
  if (pct === null || pct === 0) {
    return <span className="text-xs text-[#8b949e]">no change</span>;
  }
  const rising = pct > 0;
  const favorable = kind === "income" ? rising : !rising;
  const color = favorable ? STATUS.good : STATUS.critical;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color }}>
      {rising ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

export default function Insights() {
  const [windowKey, setWindowKey] = useState<WindowKey>("6");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const endMonth = currentMonth();

  const toggleCategory = (id: number) => {
    setSelectedCategoryIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const { data: history } = useQuery({
    queryKey: ["summary", "monthly-history"],
    queryFn: getMonthlyHistory,
  });

  const windowMonths = windowKey === "all" ? Math.max(1, history?.length ?? 6) : Number(windowKey);

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
  });

  const { data: averages } = useQuery({
    queryKey: ["summary", "category-averages", "insights", endMonth, windowMonths],
    queryFn: () => getCategoryAverages(windowMonths, endMonth),
    enabled: windowKey !== "all" || !!history,
  });

  const { data: trend } = useQuery({
    queryKey: ["summary", "trend", "insights", endMonth, windowMonths],
    queryFn: () => getTrend(windowMonths, endMonth),
  });

  const { data: merchants } = useQuery({
    queryKey: ["summary", "top-merchants", endMonth, windowMonths],
    queryFn: () => getTopMerchants(windowMonths, endMonth, 8),
  });

  const { data: recurring } = useQuery({
    queryKey: ["summary", "recurring"],
    queryFn: () => getRecurringExpenses(3),
  });

  const expenseCategories = useMemo(
    () => (categories ?? []).filter((c) => c.kind === "expense"),
    [categories],
  );
  const averageByCategory = new Map((averages ?? []).map((a) => [a.category_id, a]));

  const rankedExpenseCategories = [...expenseCategories].sort(
    (a, b) => (averageByCategory.get(b.id)?.average ?? 0) - (averageByCategory.get(a.id)?.average ?? 0),
  );

  const categoryTrendQueries = useQueries({
    queries: selectedCategoryIds.map((id) => ({
      queryKey: ["summary", "category-trend", id],
      queryFn: () => getCategoryTrend(id),
    })),
  });
  const trendById = new Map<number, CategoryTrendPoint[]>(
    selectedCategoryIds.map((id, idx) => [id, categoryTrendQueries[idx]?.data ?? []]),
  );

  const mode: "all" | "single" | "multi" =
    selectedCategoryIds.length === 0 ? "all" : selectedCategoryIds.length === 1 ? "single" : "multi";

  // Full (unwindowed) monthly series — only meaningful in "all"/"single" mode,
  // where there's exactly one series to show a year-over-year grid for.
  const fullSeries: { month: string; total: number }[] =
    mode === "single"
      ? (trendById.get(selectedCategoryIds[0]) ?? [])
      : (history ?? []).map((h) => ({ month: h.month, total: h.expenses }));

  const windowedSeries = fullSeries.slice(-windowMonths);
  const singleAvg = windowedSeries.length
    ? windowedSeries.reduce((s, p) => s + p.total, 0) / windowedSeries.length
    : 0;
  const latestPoint = windowedSeries[windowedSeries.length - 1];
  const latestDeltaPct =
    latestPoint && singleAvg > 0 ? round1(((latestPoint.total - singleAvg) / singleAvg) * 100) : null;

  // Label every point on short windows; on longer ones only the latest,
  // highest, and lowest — otherwise the line drowns in overlapping numbers.
  const labelAllPoints = windowedSeries.length <= 6;
  const latestIndex = windowedSeries.length - 1;
  const maxTotal = windowedSeries.length ? Math.max(...windowedSeries.map((p) => p.total)) : 0;
  const minTotal = windowedSeries.length ? Math.min(...windowedSeries.map((p) => p.total)) : 0;
  const renderPointLabel = (props: { x?: number; y?: number; value?: number; index?: number }) => {
    const { x, y, value, index } = props;
    if (x == null || y == null || value == null || index == null) return <g />;
    const shouldLabel = labelAllPoints || index === latestIndex || value === maxTotal || value === minTotal;
    if (!shouldLabel) return <g />;
    const text = formatCurrency(value);
    const width = text.length * 8 + 16;
    return (
      <g>
        <rect
          x={x - width / 2}
          y={y - 34}
          width={width}
          height={22}
          rx={6}
          fill={UI.surfaceRaised}
          stroke={CHART_INK.gridline}
        />
        <text x={x} y={y - 19} textAnchor="middle" fontSize={14} fontWeight={700} fill={CHART_INK.primary}>
          {text}
        </text>
      </g>
    );
  };

  const selectedLabel =
    mode === "all"
      ? "All expenses"
      : mode === "single"
        ? (expenseCategories.find((c) => c.id === selectedCategoryIds[0])?.name ?? "")
        : `${selectedCategoryIds.length} categories`;

  // Per-category averages + a month x category grid, used only in "multi" mode.
  const months = (history ?? []).map((h) => h.month);
  const multiChartData = months.slice(-windowMonths).map((month) => {
    const point: Record<string, number | string> = { month };
    for (const id of selectedCategoryIds) {
      point[`cat_${id}`] = (trendById.get(id) ?? []).find((p) => p.month === month)?.total ?? 0;
    }
    return point;
  });
  const perCategoryAvg = selectedCategoryIds.map((id, idx) => {
    const series = (trendById.get(id) ?? []).slice(-windowMonths);
    const avg = series.length ? series.reduce((s, p) => s + p.total, 0) / series.length : 0;
    return {
      id,
      name: expenseCategories.find((c) => c.id === id)?.name ?? "",
      avg,
      color: CATEGORICAL[idx % CATEGORICAL.length],
    };
  });
  const combinedAvg = perCategoryAvg.reduce((s, c) => s + c.avg, 0);
  const categoryNameByKey = Object.fromEntries(perCategoryAvg.map((c) => [`cat_${c.id}`, c.name]));

  const headlineAvg = mode === "multi" ? combinedAvg : singleAvg;

  const avgIncome = trend ? trend.reduce((s, t) => s + t.habitual_income, 0) / trend.length : 0;
  const avgExpenses = trend ? trend.reduce((s, t) => s + t.expenses, 0) / trend.length : 0;
  const avgNet = avgIncome - avgExpenses;

  const shareOfExpenses = (avg: number) => (avgExpenses > 0 ? round1((avg / avgExpenses) * 100) : null);
  const headlineSharePct = mode !== "all" ? shareOfExpenses(headlineAvg) : null;

  const pieData = rankedExpenseCategories
    .map((c) => ({
      id: c.id,
      name: c.name,
      avg: averageByCategory.get(c.id)?.average ?? 0,
      color: CATEGORY_COLOR[c.name] ?? CHART_INK.muted,
    }))
    .filter((c) => c.avg > 0);

  const maxMerchant = Math.max(1, ...(merchants ?? []).map((m) => m.total));
  const maxBarAverage = Math.max(1, ...rankedExpenseCategories.map((c) => averageByCategory.get(c.id)?.average ?? 0));

  const yoy = useMemo(() => {
    if (mode === "multi" || fullSeries.length === 0) return null;
    const years = Array.from(new Set(fullSeries.map((p) => p.month.slice(0, 4)))).sort();
    const grid = new Map<number, Map<string, number>>();
    for (const p of fullSeries) {
      const [year, monStr] = p.month.split("-");
      const mon = Number(monStr);
      if (!grid.has(mon)) grid.set(mon, new Map());
      grid.get(mon)!.set(year, p.total);
    }
    return { years, grid };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullSeries, mode]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Insights</h1>
          <p className="mt-0.5 text-sm text-[#8b949e]">
            Trends over your trailing {windowMonths} month{windowMonths === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex gap-1 rounded-full bg-[#21262d] p-0.5">
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              onClick={() => setWindowKey(w.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                windowKey === w.key ? "bg-[#30363d] text-emerald-400 shadow-sm" : "text-[#8b949e]"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="rounded-2xl bg-[#161b22] p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-[#8b949e]">
            Avg. monthly income
          </p>
          <p className="mt-1 text-2xl font-semibold text-white">{formatCurrency(avgIncome)}</p>
        </div>
        <div className="rounded-2xl bg-[#161b22] p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-[#8b949e]">
            Avg. monthly expenses
          </p>
          <p className="mt-1 text-2xl font-semibold text-white">{formatCurrency(avgExpenses)}</p>
        </div>
        <div className="rounded-2xl bg-[#161b22] p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-[#8b949e]">Avg. monthly net</p>
          <p
            className="mt-1 text-2xl font-semibold"
            style={{ color: avgNet >= 0 ? STATUS.good : STATUS.critical }}
          >
            {formatCurrency(avgNet)}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-[#161b22] p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-white">{selectedLabel} by month</h2>
            <p className="mt-2 text-3xl font-semibold text-white">
              {formatCurrency(headlineAvg)}
              <span className="ml-1.5 text-sm font-normal text-[#8b949e]">/mo avg</span>
              {headlineSharePct !== null && (
                <span className="ml-2 text-base font-medium text-[#8b949e]">
                  · {headlineSharePct}% of total expenses
                </span>
              )}
            </p>
            {mode !== "multi" && latestDeltaPct !== null && (
              <p className="mt-1 text-xs text-[#8b949e]">
                Latest month <DeltaChip pct={latestDeltaPct} kind="expense" />
              </p>
            )}
            {mode === "multi" && (
              <div className="mt-3 flex flex-wrap gap-2">
                {perCategoryAvg.map((c) => {
                  const pct = shareOfExpenses(c.avg);
                  return (
                    <div
                      key={c.id}
                      className="flex items-center gap-1.5 rounded-full bg-[#161b22] px-3 py-1 text-xs"
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                      <span className="text-[#c9d1d9]">{c.name}</span>
                      <span className="font-medium text-white">
                        {formatCurrency(c.avg)}/mo{pct !== null && ` (${pct}%)`}
                      </span>
                      <button
                        onClick={() => toggleCategory(c.id)}
                        className="ml-0.5 text-[#6e7681] hover:text-[#8b949e]"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex max-w-md flex-wrap justify-end gap-1.5">
            <button
              onClick={() => setSelectedCategoryIds([])}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === "all"
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-white/15 bg-[#21262d] text-[#c9d1d9] hover:bg-[#30363d]"
              }`}
            >
              All expenses
            </button>
            {rankedExpenseCategories.map((c) => {
              const selected = selectedCategoryIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleCategory(c.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    selected
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-white/15 bg-[#21262d] text-[#c9d1d9] hover:bg-[#30363d]"
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>

        {mode !== "multi" && windowedSeries.length > 0 && (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={windowedSeries} margin={{ top: 36, right: 50, left: 30, bottom: 4 }}>
              <CartesianGrid vertical={false} stroke={CHART_INK.gridline} />
              <XAxis
                dataKey="month"
                tickFormatter={(m: string) => MONTH_NAMES[Number(m.split("-")[1]) - 1]}
                stroke={CHART_INK.muted}
                fontSize={12}
              />
              <YAxis tickFormatter={(v) => formatCurrency(v)} stroke={CHART_INK.muted} fontSize={12} />
              <Tooltip labelFormatter={(m: string) => m} formatter={(v: number) => formatCurrency(v)} />
              <Line
                type="linear"
                dataKey="total"
                stroke={CATEGORICAL[0]}
                strokeWidth={2}
                dot={{ r: 4, fill: CATEGORICAL[0], strokeWidth: 0 }}
                activeDot={{ r: 6 }}
                label={renderPointLabel}
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {mode === "multi" && multiChartData.length > 0 && (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={multiChartData} margin={{ top: 20 }}>
              <CartesianGrid vertical={false} stroke={CHART_INK.gridline} />
              <XAxis
                dataKey="month"
                tickFormatter={(m: string) => MONTH_NAMES[Number(m.split("-")[1]) - 1]}
                stroke={CHART_INK.muted}
                fontSize={12}
              />
              <YAxis tickFormatter={(v) => formatCurrency(v)} stroke={CHART_INK.muted} fontSize={12} />
              <Tooltip
                labelFormatter={(m: string) => m}
                formatter={(v: number, name: string) => [formatCurrency(v), categoryNameByKey[name] ?? name]}
              />
              {perCategoryAvg.map((c) => (
                <Bar key={c.id} dataKey={`cat_${c.id}`} radius={[4, 4, 0, 0]} fill={c.color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {pieData.length > 0 && (
        <div className="mt-6 rounded-2xl bg-[#161b22] p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-white">Where your money goes</h2>
          <p className="mt-0.5 text-xs text-[#8b949e]">
            Share of average monthly expenses, over this window · click a slice to add/remove it above
          </p>

          <div className="mt-2 grid grid-cols-2 gap-6">
            <div className="relative">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="avg"
                    nameKey="name"
                    innerRadius={65}
                    outerRadius={105}
                    paddingAngle={1.5}
                    strokeWidth={2}
                    stroke={UI.surface}
                    cursor="pointer"
                    onClick={(d: { id: number }) => toggleCategory(d.id)}
                    label={({ value }) =>
                      avgExpenses > 0 && value / avgExpenses >= 0.08
                        ? `${Math.round((value / avgExpenses) * 100)}%`
                        : ""
                    }
                    labelLine={false}
                  >
                    {pieData.map((c) => (
                      <Cell
                        key={c.id}
                        fill={c.color}
                        opacity={selectedCategoryIds.length === 0 || selectedCategoryIds.includes(c.id) ? 1 : 0.35}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, _name, entry) => [
                      `${formatCurrency(v)}/mo (${shareOfExpenses(v)}%)`,
                      entry?.payload?.name,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-xs uppercase tracking-wide text-[#8b949e]">Avg. expenses</p>
                <p className="text-lg font-semibold text-white">{formatCurrency(avgExpenses)}/mo</p>
              </div>
            </div>

            <div className="flex flex-col justify-center gap-1.5">
              {pieData.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggleCategory(c.id)}
                  className="flex items-center justify-between rounded-lg px-2 py-1 text-left text-sm hover:bg-[#161b22]"
                >
                  <span className="flex items-center gap-2 text-[#c9d1d9]">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </span>
                  <span className="ml-3 shrink-0 font-medium text-white">
                    {formatCurrency(c.avg)} ({shareOfExpenses(c.avg)}%)
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-5 gap-6">
        <div className="col-span-3 rounded-2xl bg-[#161b22] p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-white">Average spend by category</h2>
          <p className="mt-0.5 text-xs text-[#8b949e]">
            Per month, over this window · click a bar to add/remove it above
          </p>

          {rankedExpenseCategories.length > 0 && (
            <ResponsiveContainer
              width="100%"
              height={Math.max(200, rankedExpenseCategories.length * 32)}
            >
              <BarChart
                data={rankedExpenseCategories.map((c) => ({
                  category_id: c.id,
                  category_name: c.name,
                  average: averageByCategory.get(c.id)?.average ?? 0,
                }))}
                layout="vertical"
                margin={{ left: 24, top: 12 }}
              >
                <CartesianGrid horizontal={false} stroke={CHART_INK.gridline} />
                <XAxis
                  type="number"
                  domain={[0, maxBarAverage]}
                  tickFormatter={(v) => formatCurrency(v)}
                  stroke={CHART_INK.muted}
                  fontSize={12}
                />
                <YAxis
                  type="category"
                  dataKey="category_name"
                  width={120}
                  stroke={CHART_INK.muted}
                  fontSize={12}
                />
                <Tooltip
                  formatter={(v: number) => {
                    const pct = shareOfExpenses(v);
                    return `${formatCurrency(v)}/mo avg${pct !== null ? ` (${pct}% of total)` : ""}`;
                  }}
                />
                <Bar
                  dataKey="average"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(d: { category_id: number }) => toggleCategory(d.category_id)}
                >
                  {rankedExpenseCategories.map((c) => (
                    <Cell
                      key={c.id}
                      fill={selectedCategoryIds.includes(c.id) ? CATEGORICAL[1] : CATEGORICAL[0]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="col-span-2 rounded-2xl bg-[#161b22] p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-white">Top merchants</h2>
          <p className="mt-0.5 text-xs text-[#8b949e]">Over this window</p>

          {merchants?.length === 0 && (
            <p className="mt-4 text-sm text-[#8b949e]">No spending in this window.</p>
          )}

          <div className="mt-4 space-y-3">
            {merchants?.map((m, i) => (
              <div key={m.merchant_name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate text-[#c9d1d9]">
                    <span className="mr-1.5 text-[#6e7681]">{i + 1}</span>
                    {m.merchant_name}
                  </span>
                  <span className="font-medium text-white">{formatCurrency(m.total)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-[#21262d]">
                  <div
                    className="h-1.5 rounded-full bg-emerald-500"
                    style={{ width: `${(m.total / maxMerchant) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {yoy && (
        <div className="mt-6 rounded-2xl bg-[#161b22] p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-white">Year over year — {selectedLabel}</h2>
          <p className="mt-0.5 text-xs text-[#8b949e]">Same category, every month, across years</p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="pb-2 text-left text-xs font-medium uppercase tracking-wide text-[#8b949e]">
                    Month
                  </th>
                  {yoy.years.map((y) => (
                    <th
                      key={y}
                      className="pb-2 text-right text-xs font-medium uppercase tracking-wide text-[#8b949e]"
                    >
                      {y}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MONTH_NAMES.map((name, idx) => {
                  const mon = idx + 1;
                  const values = yoy.years.map((y) => yoy.grid.get(mon)?.get(y));
                  const known = values.filter((v): v is number => v != null);
                  const rowAvg = known.length ? known.reduce((s, v) => s + v, 0) / known.length : 0;
                  return (
                    <tr key={name} className="border-t border-white/10">
                      <td className="py-1.5 text-[#8b949e]">{name}</td>
                      {yoy.years.map((y) => {
                        const v = yoy.grid.get(mon)?.get(y);
                        const isHigh = v != null && known.length > 1 && v > rowAvg * 1.15;
                        const isLow = v != null && known.length > 1 && v < rowAvg * 0.85;
                        return (
                          <td
                            key={y}
                            className="py-1.5 text-right font-medium"
                            style={{
                              color: isHigh ? STATUS.critical : isLow ? STATUS.good : CHART_INK.primary,
                            }}
                          >
                            {v != null ? formatCurrency(v) : <span className="text-[#6e7681]">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-2xl bg-[#161b22] p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-white">Recurring expenses</h2>
        <p className="mt-0.5 text-xs text-[#8b949e]">
          Merchants that charge on a regular monthly-ish cadence
        </p>

        {recurring?.length === 0 && (
          <p className="mt-4 text-sm text-[#8b949e]">Nothing recurring detected yet.</p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 md:grid-cols-3">
          {recurring?.map((r) => (
            <div
              key={r.merchant_name}
              className="flex items-center justify-between rounded-xl px-2 py-2.5 hover:bg-[#161b22]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{r.merchant_name}</p>
                <p className="text-xs text-[#8b949e]">
                  {r.category_name ?? "Uncategorized"} · {r.months_active} months
                </p>
              </div>
              <p className="ml-3 shrink-0 text-sm font-medium text-white">
                {formatCurrency(r.average_amount)}/mo
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
