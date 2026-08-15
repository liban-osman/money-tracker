import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  bulkCategorizeTransactions,
  getMonthlyHistory,
  listCategories,
  listOwedTransactions,
  listTransactions,
  Transaction,
  updateTransaction,
} from "../api/client";
import { selectChevronStyle } from "../lib/selectStyle";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

type RangeMode = "month" | "year" | "all";

const RANGE_MODES: { key: RangeMode; label: string }[] = [
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "all", label: "All time" },
];

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

type TypeFilter = "all" | "income" | "expense" | "transfer";

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "expense", label: "Expenses" },
  { key: "income", label: "Income" },
  { key: "transfer", label: "Transfers" },
];

type SortKey = "date" | "merchant" | "category" | "amount";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; className: string }[] = [
  { key: "date", label: "Date", className: "w-24 px-5 py-2.5 text-left" },
  { key: "merchant", label: "Merchant", className: "px-5 py-2.5 text-left" },
  { key: "category", label: "Category", className: "px-5 py-2.5 text-left" },
  { key: "amount", label: "Amount", className: "w-44 px-5 py-2.5 text-right" },
];

export default function Transactions() {
  const [rangeMode, setRangeMode] = useState<RangeMode>("month");
  const [month, setMonth] = useState(currentMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<number | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const queryClient = useQueryClient();

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "date" || key === "amount" ? "desc" : "asc");
    }
  };

  const { data: history } = useQuery({
    queryKey: ["summary", "monthly-history"],
    queryFn: getMonthlyHistory,
  });
  const availableYears = useMemo(() => {
    const years = new Set((history ?? []).map((h) => Number(h.month.slice(0, 4))));
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [history]);

  const rangeParams =
    rangeMode === "month" ? { month } : rangeMode === "year" ? { year } : {};

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["transactions", rangeMode, rangeMode === "month" ? month : rangeMode === "year" ? year : "all"],
    queryFn: () => listTransactions(rangeParams),
  });

  useEffect(() => {
    setSelectedIds(new Set());
  }, [transactions]);

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
  });

  const { data: owed } = useQuery({
    queryKey: ["transactions", "owed"],
    queryFn: listOwedTransactions,
  });

  const recategorize = useMutation({
    mutationFn: ({ id, categoryId }: { id: number; categoryId: number }) =>
      updateTransaction(id, { category_id: categoryId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
  });

  const splitMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof updateTransaction>[1] }) =>
      updateTransaction(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: ({ ids, categoryId }: { ids: number[]; categoryId: number }) =>
      bulkCategorizeTransactions(ids, categoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      setSelectedIds(new Set());
      setBulkCategoryId("");
    },
  });

  const kindOf = (tx: NonNullable<typeof transactions>[number]): TypeFilter =>
    tx.is_transfer ? "transfer" : (tx.category?.kind as TypeFilter | undefined) ?? "expense";

  const categoryOptions = useMemo(
    () => (categories ?? []).filter((c) => typeFilter === "all" || c.kind === typeFilter),
    [categories, typeFilter],
  );

  const filteredTransactions = (transactions ?? []).filter((tx) => {
    if (typeFilter !== "all" && kindOf(tx) !== typeFilter) return false;
    if (categoryFilter !== "all" && tx.category?.id !== categoryFilter) return false;
    return true;
  });

  const sortedTransactions = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filteredTransactions].sort((a, b) => {
      switch (sortKey) {
        case "merchant":
          return (a.merchant_name ?? a.name).localeCompare(b.merchant_name ?? b.name) * dir;
        case "category":
          return (a.category?.name ?? "").localeCompare(b.category?.name ?? "") * dir;
        case "amount": {
          // A split expense sorts by your actual share, not the full amount
          // you fronted — matches what it really cost you.
          const effA = a.split_share ?? a.amount;
          const effB = b.split_share ?? b.amount;
          return (-effA - -effB) * dir;
        }
        case "date":
        default:
          return a.date.localeCompare(b.date) * dir;
      }
    });
  }, [filteredTransactions, sortKey, sortDir]);

  const filteredTotal = filteredTransactions.reduce((sum, tx) => sum - tx.amount, 0);

  const allVisibleSelected =
    sortedTransactions.length > 0 && sortedTransactions.every((tx) => selectedIds.has(tx.id));

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const tx of sortedTransactions) next.delete(tx.id);
      } else {
        for (const tx of sortedTransactions) next.add(tx.id);
      }
      return next;
    });
  };

  const toggleOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Transactions</h1>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-full bg-[#21262d] p-0.5">
            {RANGE_MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setRangeMode(m.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  rangeMode === m.key ? "bg-[#30363d] text-emerald-400 shadow-sm" : "text-[#8b949e]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {rangeMode === "month" && (
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-full border-0 bg-[#161b22] px-4 py-2 text-sm text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          )}
          {rangeMode === "year" && (
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="appearance-none rounded-full border-0 bg-[#161b22] py-2 pl-4 pr-8 text-sm text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              style={selectChevronStyle}
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {owed && owed.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/[0.08] p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-amber-300">Owed to you</h2>
            <p className="text-lg font-semibold text-white">
              {formatCurrency(owed.reduce((s, tx) => s + (tx.owed_amount ?? 0), 0))}
            </p>
          </div>
          <div className="mt-2 space-y-1.5">
            {owed.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between text-sm">
                <span className="text-white">
                  {tx.merchant_name ?? tx.name} <span className="text-[#8b949e]">· {tx.date}</span>
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-amber-300">{formatCurrency(tx.owed_amount ?? 0)}</span>
                  <button
                    onClick={() => splitMutation.mutate({ id: tx.id, body: { split_settled: true } })}
                    className="rounded-full border border-amber-500/40 bg-[#21262d] px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-[#30363d]"
                  >
                    Mark repaid
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full bg-[#21262d] p-0.5">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => {
                setTypeFilter(f.key);
                setCategoryFilter("all");
              }}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                typeFilter === f.key ? "bg-[#30363d] text-emerald-400 shadow-sm" : "text-[#8b949e]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
          className="appearance-none rounded-full border-0 bg-[#161b22] py-1.5 pl-3 pr-7 text-xs text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          style={selectChevronStyle}
        >
          <option value="all">All categories</option>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <p className="text-xs text-[#8b949e]">
          {filteredTransactions.length} transaction{filteredTransactions.length === 1 ? "" : "s"} ·
          Total: <span className="font-medium text-[#c9d1d9]">{formatCurrency(filteredTotal)}</span>
        </p>
      </div>

      {selectedIds.size > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-emerald-950/40 px-5 py-3">
          <p className="text-sm font-medium text-emerald-300">{selectedIds.size} selected</p>
          <div className="flex items-center gap-2">
            <select
              value={bulkCategoryId}
              onChange={(e) => setBulkCategoryId(e.target.value)}
              className="appearance-none rounded-full border-0 bg-[#161b22] py-1.5 pl-3 pr-7 text-xs text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              style={selectChevronStyle}
            >
              <option value="">Change category to...</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              disabled={!bulkCategoryId || bulkMutation.isPending}
              onClick={() =>
                bulkMutation.mutate({ ids: Array.from(selectedIds), categoryId: Number(bulkCategoryId) })
              }
              className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {bulkMutation.isPending ? "Applying..." : "Apply"}
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="rounded-full bg-[#161b22] px-3 py-1.5 text-xs font-medium text-[#8b949e] shadow-sm hover:bg-[#21262d]"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-2xl bg-[#161b22] shadow-sm">
        {isLoading && <p className="p-4 text-sm text-[#8b949e]">Loading...</p>}
        {!isLoading && filteredTransactions.length === 0 && (
          <p className="p-4 text-sm text-[#8b949e]">No transactions match this filter.</p>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="w-10 py-2.5 pl-5">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  className="rounded border-white/20 text-emerald-600 focus:ring-emerald-500"
                />
              </th>
              {COLUMNS.map((col) => (
                <th key={col.key} className={`${col.className} font-medium text-[#8b949e]`}>
                  <button
                    onClick={() => toggleSort(col.key)}
                    className={`inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide hover:text-white ${
                      col.key === "amount" ? "flex-row-reverse" : ""
                    } ${sortKey === col.key ? "text-white" : "text-[#8b949e]"}`}
                  >
                    {col.label}
                    {sortKey === col.key && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedTransactions.map((tx) => (
              <tr key={tx.id} className="border-b border-white/10 last:border-0 hover:bg-[#161b22]">
                <td className="w-10 py-3 pl-5">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(tx.id)}
                    onChange={() => toggleOne(tx.id)}
                    className="rounded border-white/20 text-emerald-600 focus:ring-emerald-500"
                  />
                </td>
                <td className="w-24 px-5 py-3 text-[#8b949e]">{tx.date}</td>
                <td className="px-5 py-3">
                  <p className="text-white">{tx.merchant_name ?? tx.name}</p>
                  <p className="text-xs text-[#8b949e]">{tx.account.name}</p>
                </td>
                <td className="px-5 py-3">
                  <select
                    value={tx.category?.id ?? ""}
                    onChange={(e) =>
                      recategorize.mutate({ id: tx.id, categoryId: Number(e.target.value) })
                    }
                    className="appearance-none rounded-full border-0 bg-[#21262d] py-1 pl-2.5 pr-7 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    style={selectChevronStyle}
                  >
                    {!tx.category && <option value="">Needs review</option>}
                    {categories?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {tx.is_transfer && (
                    <span className="ml-2 text-xs text-[#8b949e]">transfer</span>
                  )}
                </td>
                <td className="w-44 px-5 py-3 text-right">
                  <p className="font-medium text-white">{formatCurrency(-tx.amount)}</p>
                  {!tx.is_transfer && kindOf(tx) === "expense" && tx.amount > 0 && (
                    <SplitControl
                      transaction={tx}
                      onSave={(share) => splitMutation.mutate({ id: tx.id, body: { split_share: share } })}
                      onSettle={() => splitMutation.mutate({ id: tx.id, body: { split_settled: true } })}
                      onUnsplit={() => splitMutation.mutate({ id: tx.id, body: { split_share: null } })}
                      saving={splitMutation.isPending}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SplitControl({
  transaction,
  onSave,
  onSettle,
  onUnsplit,
  saving,
}: {
  transaction: Transaction;
  onSave: (share: number) => void;
  onSettle: () => void;
  onUnsplit: () => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<"amount" | "people">("amount");
  const [value, setValue] = useState(String(transaction.amount));
  const [people, setPeople] = useState("2");

  const computedShare =
    mode === "people" && Number(people) > 0
      ? Math.round((transaction.amount / Number(people)) * 100) / 100
      : Number(value);

  if (editing) {
    return (
      <div className="mt-1 flex flex-col items-end gap-1">
        <div className="flex gap-1 rounded-full bg-[#21262d] p-0.5">
          <button
            onClick={() => setMode("amount")}
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              mode === "amount" ? "bg-[#30363d] text-white shadow-sm" : "text-[#8b949e]"
            }`}
          >
            Amount
          </button>
          <button
            onClick={() => setMode("people")}
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              mode === "people" ? "bg-[#30363d] text-white shadow-sm" : "text-[#8b949e]"
            }`}
          >
            Split X ways
          </button>
        </div>

        {mode === "amount" ? (
          <div className="flex items-center gap-1">
            <span className="text-xs text-[#8b949e]">Your share</span>
            <input
              type="number"
              step="any"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-16 rounded-md border-0 bg-[#21262d] px-1.5 py-0.5 text-right text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <span className="text-xs text-[#8b949e]">Split between</span>
            <input
              type="number"
              step="1"
              min="1"
              autoFocus
              value={people}
              onChange={(e) => setPeople(e.target.value)}
              className="w-12 rounded-md border-0 bg-[#21262d] px-1.5 py-0.5 text-right text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <span className="text-xs text-[#8b949e]">
              people · your share {formatCurrency(computedShare)}
            </span>
          </div>
        )}

        <div className="flex gap-1">
          <button
            disabled={saving || !Number.isFinite(computedShare)}
            onClick={() => {
              onSave(computedShare);
              setEditing(false);
            }}
            className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded-full bg-[#21262d] px-2 py-0.5 text-xs font-medium text-[#8b949e] hover:bg-[#30363d]"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (transaction.split_share == null) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="mt-0.5 text-xs font-medium text-[#8b949e] hover:text-emerald-400"
      >
        Split
      </button>
    );
  }

  if (transaction.split_settled) {
    return (
      <div className="mt-0.5 flex items-center justify-end gap-1.5">
        <span className="text-xs text-[#8b949e]">
          Your share {formatCurrency(transaction.split_share)} · Settled
        </span>
        <button onClick={onUnsplit} className="text-xs text-[#6e7681] hover:text-[#8b949e]">
          undo
        </button>
      </div>
    );
  }

  return (
    <div className="mt-0.5 flex items-center justify-end gap-1.5">
      <span className="text-xs font-semibold text-amber-300">
        Owed {formatCurrency(transaction.owed_amount ?? 0)}
      </span>
      <button
        onClick={onSettle}
        className="rounded-full border border-amber-500/40 bg-[#21262d] px-2 py-0.5 text-xs font-medium text-amber-300 hover:bg-[#30363d]"
      >
        Repaid
      </button>
      <button onClick={() => setEditing(true)} className="text-xs text-[#6e7681] hover:text-[#8b949e]">
        edit
      </button>
    </div>
  );
}
