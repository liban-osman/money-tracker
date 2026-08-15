import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { createHolding, deleteHolding, getNetWorth, Holding, updateHolding } from "../api/client";
import { CATEGORICAL, CHART_INK, STATUS, UI } from "../lib/colors";
import { selectChevronStyle } from "../lib/selectStyle";

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const ASSET_TYPES = [
  { key: "stock", label: "Stock" },
  { key: "etf", label: "ETF" },
  { key: "crypto", label: "Crypto" },
  { key: "cash", label: "Cash" },
  { key: "workplace_rrsp", label: "Workplace RRSP (locked)" },
] as const;

const MANUAL_VALUE_TYPES = new Set(["cash", "workplace_rrsp"]);

// Fixed identity -> color mapping, shared by the donut and the legend.
const ASSET_CLASS_COLOR: Record<string, string> = {
  cash: CATEGORICAL[0],
  stock: CATEGORICAL[1],
  etf: CATEGORICAL[2],
  crypto: CATEGORICAL[3],
  investment: CATEGORICAL[4],
  other: CHART_INK.muted,
};

const ASSET_CLASS_LABEL: Record<string, string> = {
  cash: "Cash",
  stock: "Stock",
  etf: "ETF",
  crypto: "Crypto",
  investment: "Registered / investment account",
  other: "Other",
};

const EMPTY_FORM = {
  symbol: "",
  name: "",
  asset_type: "stock" as string,
  quantity: "",
  average_cost: "",
  include_in_net_worth: true,
  note: "",
};

function HoldingForm({
  initial,
  onCancel,
  onSubmit,
  submitting,
}: {
  initial: typeof EMPTY_FORM;
  onCancel: () => void;
  onSubmit: (values: typeof EMPTY_FORM) => void;
  submitting: boolean;
}) {
  const [values, setValues] = useState(initial);
  const isManualValue = MANUAL_VALUE_TYPES.has(values.asset_type);

  return (
    <div className="space-y-3 rounded-2xl bg-[#161b22] p-4">
      <div className="grid grid-cols-6 gap-3">
        <input
          placeholder={isManualValue ? "Label (e.g. TFSA, RRSP, Kraken)" : "Symbol (e.g. VOO, BTC)"}
          value={values.symbol}
          onChange={(e) => setValues({ ...values, symbol: e.target.value.toUpperCase() })}
          className="col-span-2 rounded-lg border-0 bg-[#21262d] px-3 py-2 text-sm text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <select
          value={values.asset_type}
          onChange={(e) => {
            const asset_type = e.target.value;
            setValues({
              ...values,
              asset_type,
              include_in_net_worth: asset_type === "workplace_rrsp" ? false : values.include_in_net_worth,
            });
          }}
          className="appearance-none rounded-lg border-0 bg-[#21262d] py-2 pl-3 pr-7 text-sm text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          style={selectChevronStyle}
        >
          {ASSET_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          placeholder={isManualValue ? "Amount (CAD)" : "Quantity"}
          type="number"
          step="any"
          value={values.quantity}
          onChange={(e) => setValues({ ...values, quantity: e.target.value })}
          className="rounded-lg border-0 bg-[#21262d] px-3 py-2 text-sm text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <input
          placeholder={isManualValue ? "N/A" : "Avg. cost / unit"}
          type="number"
          step="any"
          value={isManualValue ? "" : values.average_cost}
          disabled={isManualValue}
          onChange={(e) => setValues({ ...values, average_cost: e.target.value })}
          className="rounded-lg border-0 bg-[#21262d] px-3 py-2 text-sm text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-[#1a1f26] disabled:text-[#6e7681]"
        />
        <div className="flex gap-2">
          <button
            disabled={submitting || !values.symbol || !values.quantity}
            onClick={() => onSubmit(values)}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Save
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg bg-[#161b22] px-3 py-2 text-xs font-medium text-[#8b949e] shadow-sm hover:bg-[#21262d]"
          >
            Cancel
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <input
          placeholder="Note (optional) — e.g. contribution schedule, restrictions"
          value={values.note}
          onChange={(e) => setValues({ ...values, note: e.target.value })}
          className="flex-1 rounded-lg border-0 bg-[#21262d] px-3 py-2 text-sm text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-[#c9d1d9]">
          <input
            type="checkbox"
            checked={values.include_in_net_worth}
            onChange={(e) => setValues({ ...values, include_in_net_worth: e.target.checked })}
            className="rounded border-white/20 text-emerald-400 focus:ring-emerald-500"
          />
          Count toward net worth
        </label>
      </div>
    </div>
  );
}

const MAX_DONUT_SLICES = 6;

export default function Assets() {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const {
    data: netWorth,
    isLoading,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useQuery({
    queryKey: ["holdings", "net-worth"],
    queryFn: getNetWorth,
    refetchInterval: 60_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["holdings"] });
  };

  const createMutation = useMutation({
    mutationFn: createHolding,
    onSuccess: () => {
      invalidate();
      setAdding(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof updateHolding>[1] }) =>
      updateHolding(id, body),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteHolding,
    onSuccess: invalidate,
  });

  const holdings = netWorth?.holdings ?? [];
  const sortedHoldings = [...holdings].sort(
    (a, b) => (b.market_value_cad ?? 0) - (a.market_value_cad ?? 0),
  );

  const totalAssets = netWorth ? netWorth.cash + netWorth.investments : 0;

  const donut = useMemo(() => {
    if (!netWorth) return [];

    const bankCash = netWorth.by_account
      .filter((a) => a.type === "depository")
      .reduce((s, a) => s + a.balance, 0);

    const positions: { name: string; value: number; assetType: string }[] = [];
    if (bankCash > 0) positions.push({ name: "Bank cash", value: bankCash, assetType: "cash" });

    for (const a of netWorth.by_account) {
      if (a.type === "investment" && a.balance > 0) {
        positions.push({ name: a.account_name, value: a.balance, assetType: "investment" });
      }
    }
    for (const h of holdings) {
      if ((h.market_value_cad ?? 0) > 0) {
        positions.push({ name: h.name || h.symbol, value: h.market_value_cad!, assetType: h.asset_type });
      }
    }

    positions.sort((a, b) => b.value - a.value);
    if (positions.length <= MAX_DONUT_SLICES) return positions;

    const head = positions.slice(0, MAX_DONUT_SLICES - 1);
    const tail = positions.slice(MAX_DONUT_SLICES - 1);
    const otherValue = tail.reduce((s, p) => s + p.value, 0);
    return [...head, { name: "Other", value: otherValue, assetType: "other" }];
  }, [netWorth, holdings]);

  const donutTotal = donut.reduce((s, d) => s + d.value, 0);
  const legendClasses = Array.from(new Set(donut.map((d) => d.assetType)));

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Assets</h1>
          <p className="mt-0.5 text-sm text-[#8b949e]">What you have, right now</p>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          {adding ? "Close" : "Add holding"}
        </button>
      </div>

      {isLoading && <p className="mt-6 text-sm text-[#8b949e]">Loading...</p>}

      {netWorth && (
        <>
          <div className="mt-6 rounded-2xl border border-white/10 bg-[#21262d] p-6 text-white shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-[#8b949e]">Net worth</p>
            <p className="mt-1 text-4xl font-semibold">{formatCurrency(netWorth.net_worth)}</p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-[#161b22] p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-[#8b949e]">Cash</p>
              <p className="mt-1 text-xl font-semibold text-white">{formatCurrency(netWorth.cash)}</p>
            </div>
            <div className="rounded-2xl bg-[#161b22] p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-[#8b949e]">Investments</p>
              <p className="mt-1 text-xl font-semibold text-white">
                {formatCurrency(netWorth.investments)}
              </p>
            </div>
          </div>

          {donut.length > 0 && (
            <div className="mt-6 rounded-2xl bg-[#161b22] p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-white">What you own</h2>
              <p className="mt-0.5 text-xs text-[#8b949e]">
                Every position, by share of total assets
                {donut.some((d) => d.name === "Other") &&
                  ` (top ${MAX_DONUT_SLICES - 1}, rest folded into "Other")`}
              </p>

              <div className="mt-2 grid grid-cols-2 gap-6">
                <div className="relative">
                  <ResponsiveContainer width="100%" height={320}>
                    <PieChart margin={{ top: 24, right: 0, bottom: 24, left: 0 }}>
                      <Pie
                        data={donut}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={65}
                        outerRadius={100}
                        paddingAngle={1.5}
                        strokeWidth={2}
                        stroke={UI.surface}
                        label={({ value }) =>
                          value / donutTotal >= 0.08 ? `${Math.round((value / donutTotal) * 100)}%` : ""
                        }
                        labelLine={false}
                      >
                        {donut.map((d) => (
                          <Cell key={d.name} fill={ASSET_CLASS_COLOR[d.assetType]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number, _name, entry) => [
                          `${formatCurrency(value)} (${((value / donutTotal) * 100).toFixed(1)}%)`,
                          entry?.payload?.name,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-xs uppercase tracking-wide text-[#8b949e]">Total assets</p>
                    <p className="text-lg font-semibold text-white">{formatCurrency(totalAssets)}</p>
                  </div>
                </div>

                <div className="flex flex-col justify-center gap-2">
                  {legendClasses.map((cls) => (
                    <div key={cls} className="flex items-center gap-2 text-sm">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: ASSET_CLASS_COLOR[cls] }}
                      />
                      <span className="text-[#c9d1d9]">{ASSET_CLASS_LABEL[cls]}</span>
                    </div>
                  ))}
                  <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
                    {donut.map((d) => (
                      <div key={d.name} className="flex items-center justify-between text-xs">
                        <span className="truncate text-[#8b949e]">{d.name}</span>
                        <span className="ml-2 shrink-0 font-medium text-[#c9d1d9]">
                          {formatCurrency(d.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 rounded-2xl bg-[#161b22] p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Holdings</h2>
              <div className="flex items-center gap-2">
                <p className="text-xs text-[#8b949e]">
                  {isFetching
                    ? "Updating prices…"
                    : dataUpdatedAt
                      ? `Prices as of ${new Date(dataUpdatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}`
                      : ""}
                </p>
                <button
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="rounded-full bg-[#21262d] px-2.5 py-1 text-xs font-medium text-[#c9d1d9] hover:bg-[#30363d] disabled:opacity-50"
                >
                  Refresh
                </button>
              </div>
            </div>

            {adding && (
              <div className="mt-4">
                <HoldingForm
                  initial={EMPTY_FORM}
                  submitting={createMutation.isPending}
                  onCancel={() => setAdding(false)}
                  onSubmit={(values) =>
                    createMutation.mutate({
                      symbol: values.symbol,
                      name: values.name || undefined,
                      asset_type: values.asset_type,
                      quantity: Number(values.quantity),
                      average_cost:
                        !MANUAL_VALUE_TYPES.has(values.asset_type) && values.average_cost
                          ? Number(values.average_cost)
                          : undefined,
                      include_in_net_worth: values.include_in_net_worth,
                      note: values.note || undefined,
                    })
                  }
                />
              </div>
            )}

            {sortedHoldings.length === 0 && !adding && (
              <p className="mt-4 text-sm text-[#8b949e]">
                No holdings yet. Add your stocks, ETFs, crypto, and registered-account cash to track
                them alongside your bank balances.
              </p>
            )}

            <div className="mt-4 space-y-1">
              {sortedHoldings.map((h) =>
                editingId === h.id ? (
                  <div key={h.id} className="py-1">
                    <HoldingForm
                      initial={{
                        symbol: h.symbol,
                        name: h.name ?? "",
                        asset_type: h.asset_type,
                        quantity: String(h.quantity),
                        average_cost: h.average_cost != null ? String(h.average_cost) : "",
                        include_in_net_worth: h.include_in_net_worth,
                        note: h.note ?? "",
                      }}
                      submitting={updateMutation.isPending}
                      onCancel={() => setEditingId(null)}
                      onSubmit={(values) =>
                        updateMutation.mutate({
                          id: h.id,
                          body: {
                            symbol: values.symbol,
                            name: values.name || undefined,
                            asset_type: values.asset_type,
                            quantity: Number(values.quantity),
                            average_cost:
                              !MANUAL_VALUE_TYPES.has(values.asset_type) && values.average_cost
                                ? Number(values.average_cost)
                                : undefined,
                            include_in_net_worth: values.include_in_net_worth,
                            note: values.note || undefined,
                          },
                        })
                      }
                    />
                  </div>
                ) : (
                  <HoldingRow
                    key={h.id}
                    holding={h}
                    shareOfTotal={totalAssets > 0 ? (h.market_value_cad ?? 0) / totalAssets : 0}
                    onEdit={() => setEditingId(h.id)}
                    onDelete={() => deleteMutation.mutate(h.id)}
                  />
                ),
              )}
            </div>
          </div>

          {(netWorth.excluded_holdings.length > 0 || editingId !== null) && (
            <div className="mt-6 rounded-2xl bg-[#161b22] p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-white">Tracked, not counted in net worth</h2>
              <p className="mt-0.5 text-xs text-[#8b949e]">
                Locked or restricted accounts you want visibility into without inflating your totals
              </p>

              <div className="mt-4 space-y-1">
                {netWorth.excluded_holdings.map((h) =>
                  editingId === h.id ? (
                    <div key={h.id} className="py-1">
                      <HoldingForm
                        initial={{
                          symbol: h.symbol,
                          name: h.name ?? "",
                          asset_type: h.asset_type,
                          quantity: String(h.quantity),
                          average_cost: h.average_cost != null ? String(h.average_cost) : "",
                          include_in_net_worth: h.include_in_net_worth,
                          note: h.note ?? "",
                        }}
                        submitting={updateMutation.isPending}
                        onCancel={() => setEditingId(null)}
                        onSubmit={(values) =>
                          updateMutation.mutate({
                            id: h.id,
                            body: {
                              symbol: values.symbol,
                              name: values.name || undefined,
                              asset_type: values.asset_type,
                              quantity: Number(values.quantity),
                              average_cost:
                                !MANUAL_VALUE_TYPES.has(values.asset_type) && values.average_cost
                                  ? Number(values.average_cost)
                                  : undefined,
                              include_in_net_worth: values.include_in_net_worth,
                              note: values.note || undefined,
                            },
                          })
                        }
                      />
                    </div>
                  ) : (
                    <div key={h.id} className="flex items-center justify-between rounded-xl px-2 py-3 hover:bg-[#161b22]">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">
                          {h.name ?? h.symbol}
                          <span className="ml-2 text-xs font-normal uppercase tracking-wide text-[#8b949e]">
                            {h.asset_type.replace("_", " ")}
                          </span>
                        </p>
                        {h.note && <p className="mt-0.5 max-w-xl text-xs text-[#8b949e]">{h.note}</p>}
                      </div>
                      <div className="flex items-center gap-6">
                        <p className="text-sm font-medium text-white">
                          {h.market_value_cad != null ? formatCurrency(h.market_value_cad) : "—"}
                        </p>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setEditingId(h.id)}
                            className="rounded-full bg-[#21262d] px-2.5 py-1 text-xs font-medium text-[#c9d1d9] hover:bg-[#30363d]"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteMutation.mutate(h.id)}
                            className="rounded-full bg-[#21262d] px-2.5 py-1 text-xs font-medium text-[#c9d1d9] hover:bg-red-950/40 hover:text-red-400"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function HoldingRow({
  holding,
  shareOfTotal,
  onEdit,
  onDelete,
}: {
  holding: Holding;
  shareOfTotal: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isCash = holding.asset_type === "cash";
  const gainColor =
    holding.gain_loss_cad == null ? UI.textMuted : holding.gain_loss_cad >= 0 ? STATUS.good : STATUS.critical;

  return (
    <div className="flex items-center justify-between rounded-xl px-2 py-3 hover:bg-[#161b22]">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">
          {holding.symbol}
          <span className="ml-2 text-xs font-normal uppercase tracking-wide text-[#8b949e]">
            {holding.asset_type}
          </span>
        </p>
        <p className="truncate text-xs text-[#8b949e]">
          {holding.name ?? ""}
          {!isCash && ` · ${holding.quantity} units`}
          {holding.price_unavailable && " · live price unavailable"}
        </p>
      </div>
      <div className="flex items-center gap-6">
        <div className="text-right">
          <p className="text-sm font-medium text-white">
            {holding.market_value_cad != null ? formatCurrency(holding.market_value_cad) : "—"}
          </p>
          {holding.gain_loss_cad != null && (
            <p className="text-xs font-medium" style={{ color: gainColor }}>
              {holding.gain_loss_cad >= 0 ? "▲" : "▼"} {formatCurrency(Math.abs(holding.gain_loss_cad))}
              {holding.gain_loss_pct != null && ` (${holding.gain_loss_pct.toFixed(1)}%)`}
            </p>
          )}
          {holding.market_value_cad != null && (
            <p className="text-xs text-[#8b949e]">{(shareOfTotal * 100).toFixed(1)}% of total assets</p>
          )}
        </div>
        <div className="flex gap-1">
          <button
            onClick={onEdit}
            className="rounded-full bg-[#21262d] px-2.5 py-1 text-xs font-medium text-[#c9d1d9] hover:bg-[#30363d]"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="rounded-full bg-[#21262d] px-2.5 py-1 text-xs font-medium text-[#c9d1d9] hover:bg-red-950/40 hover:text-red-400"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
