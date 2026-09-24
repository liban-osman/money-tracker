import { useState } from "react";

import SyncButton from "./components/SyncButton";
import Accounts from "./pages/Accounts";
import Assets from "./pages/Assets";
import Bills from "./pages/Bills";
import Dashboard from "./pages/Dashboard";
import Insights from "./pages/Insights";
import Transactions from "./pages/Transactions";

type Tab = "dashboard" | "transactions" | "insights" | "bills" | "assets" | "accounts";

const TABS: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "transactions", label: "Transactions" },
  { key: "insights", label: "Insights" },
  { key: "bills", label: "Monthly Expenses" },
  { key: "assets", label: "Assets" },
  { key: "accounts", label: "Accounts" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <div className="flex items-center justify-between bg-[#161b22] px-8 py-4 shadow-[0_1px_0_0_rgba(255,255,255,0.08)]">
        <div className="flex items-center gap-8">
          <span className="text-lg font-semibold tracking-tight text-white">
            Money<span className="text-emerald-500">Tracker</span>
          </span>
          <nav className="flex gap-1 rounded-full bg-[#21262d] p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? "bg-[#30363d] text-emerald-400 shadow-sm"
                    : "text-[#8b949e] hover:text-[#c9d1d9]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
        <SyncButton />
      </div>

      {tab === "dashboard" && <Dashboard />}
      {tab === "transactions" && <Transactions />}
      {tab === "insights" && <Insights />}
      {tab === "bills" && <Bills />}
      {tab === "assets" && <Assets />}
      {tab === "accounts" && <Accounts />}
    </div>
  );
}
