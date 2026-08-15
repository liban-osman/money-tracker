import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { syncTransactions } from "../api/client";

export default function SyncButton() {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const result = await syncTransactions();
      const total = result.items.reduce((sum, i) => sum + i.added + i.modified, 0);
      setLastResult(`Synced ${total} transaction${total === 1 ? "" : "s"}`);
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["summary"] });
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!error && lastResult && <p className="text-sm text-[#8b949e]">{lastResult}</p>}
      <button
        onClick={handleSync}
        disabled={syncing}
        className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
      >
        {syncing ? "Syncing..." : "Sync Now"}
      </button>
    </div>
  );
}
