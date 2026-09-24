import { useQuery } from "@tanstack/react-query";

import { getMonthlyBills } from "../api/client";
import { UI } from "../lib/colors";

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function Bills() {
  const { data, isLoading } = useQuery({
    queryKey: ["summary", "monthly-bills"],
    queryFn: getMonthlyBills,
  });

  const active = (data?.items ?? []).filter((b) => b.active);
  const inactive = (data?.items ?? []).filter((b) => !b.active);

  return (
    <div className="p-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Monthly Expenses</h1>
        <p className="mt-0.5 text-sm text-[#8b949e]">
          Your actual subscriptions and fixed bills — hand-picked, not auto-detected
        </p>
      </div>

      {isLoading && <p className="mt-6 text-sm text-[#8b949e]">Loading...</p>}

      {data && (
        <>
          <div className="mt-6 rounded-2xl border border-white/10 bg-[#21262d] p-6 text-white shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-[#8b949e]">
              Total per month
            </p>
            <p className="mt-1 text-4xl font-semibold">{formatCurrency(data.total_monthly)}</p>
          </div>

          <div className="mt-6 rounded-2xl bg-[#161b22] p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-white">Bills</h2>
            <div className="mt-4 space-y-1">
              {active.map((bill) => (
                <div
                  key={bill.label}
                  className="flex items-center justify-between rounded-xl px-2 py-3 hover:bg-[#21262d]"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      {bill.label}
                      <span className="ml-2 text-xs font-normal uppercase tracking-wide text-[#8b949e]">
                        {bill.frequency}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-[#8b949e]">
                      {bill.frequency === "monthly" && bill.charge_count > 1
                        ? `${bill.charge_count} charges this cycle · `
                        : ""}
                      {bill.frequency === "annual" &&
                        `Billed once a year — ${formatCurrency(bill.last_amount ?? 0)} · `}
                      {bill.last_date && `last charged ${formatDate(bill.last_date)}`}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-white">
                    {formatCurrency(bill.monthly_amount)}
                    {bill.frequency === "annual" && (
                      <span className="ml-1 text-xs font-normal text-[#8b949e]">/mo</span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {inactive.length > 0 && (
            <div className="mt-6 rounded-2xl bg-[#161b22] p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-white">Not currently charging</h2>
              <p className="mt-0.5 text-xs text-[#8b949e]">
                On your list, but no charge in a while — may have lapsed or changed billing
              </p>
              <div className="mt-4 space-y-1">
                {inactive.map((bill) => (
                  <div
                    key={bill.label}
                    className="flex items-center justify-between rounded-xl px-2 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium" style={{ color: UI.textMuted }}>
                        {bill.label}
                      </p>
                      <p className="mt-0.5 text-xs text-[#6e7681]">
                        {bill.last_date
                          ? `last charged ${formatDate(bill.last_date)} · ${formatCurrency(bill.last_amount ?? 0)}`
                          : "no charges found"}
                      </p>
                    </div>
                    <p className="text-sm font-medium text-[#6e7681]">$0.00</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
