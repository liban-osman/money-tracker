import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { importAccountCsv } from "../api/client";

export default function ImportCsvButton({ accountId }: { accountId: number }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (file: File) => importAccountCsv(accountId, file),
    onSuccess: (result) => {
      setMessage(
        `Imported ${result.added}, skipped ${result.skipped_existing + result.skipped_duplicate} already known`,
      );
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
    onError: (err) => {
      setMessage(err instanceof Error ? err.message : "Import failed");
    },
  });

  return (
    <div className="text-right">
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) mutation.mutate(file);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={mutation.isPending}
        className="rounded-full bg-[#21262d] px-3 py-1 text-xs font-medium text-[#c9d1d9] hover:bg-[#30363d] disabled:opacity-50"
      >
        {mutation.isPending ? "Importing..." : "Import CSV"}
      </button>
      {message && <p className="mt-1 text-xs text-[#8b949e]">{message}</p>}
    </div>
  );
}
