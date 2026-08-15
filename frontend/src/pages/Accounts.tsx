import { useQuery } from "@tanstack/react-query";

import { listAccounts } from "../api/client";
import ImportCsvButton from "../components/ImportCsvButton";
import PlaidLinkButton from "../components/PlaidLinkButton";

export default function Accounts() {
  const { data: accounts, isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: listAccounts,
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Accounts</h1>
        <PlaidLinkButton />
      </div>

      <div className="mt-6 space-y-3">
        {isLoading && <p className="text-sm text-[#8b949e]">Loading...</p>}
        {!isLoading && accounts?.length === 0 && (
          <p className="text-sm text-[#8b949e]">
            No accounts linked yet. Connect TD checking, TD credit, and Amex above.
          </p>
        )}
        {accounts?.map((account) => (
          <div
            key={account.id}
            className="grid grid-cols-[1fr_180px_auto] items-center gap-4 rounded-2xl bg-[#161b22] p-5 shadow-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-white">
                {account.name} {account.mask && <span className="text-[#8b949e]">••{account.mask}</span>}
              </p>
              <p className="mt-0.5 text-xs uppercase tracking-wide text-[#8b949e]">
                {account.type}
                {account.subtype ? ` · ${account.subtype}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-white">
                {account.current_balance != null
                  ? account.current_balance.toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                    })
                  : "—"}
              </p>
              {account.credit_limit != null && (
                <p className="text-xs text-[#8b949e]">
                  limit{" "}
                  {account.credit_limit.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                  })}
                </p>
              )}
            </div>
            <ImportCsvButton accountId={account.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
