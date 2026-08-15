import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";

import { createLinkToken, exchangePublicToken } from "../api/client";

const LINK_TOKEN_STORAGE_KEY = "plaid_link_token";

function isOAuthReturn(): boolean {
  return new URLSearchParams(window.location.search).has("oauth_state_id");
}

export default function PlaidLinkButton() {
  const queryClient = useQueryClient();
  const [linkToken, setLinkToken] = useState<string | null>(
    () => sessionStorage.getItem(LINK_TOKEN_STORAGE_KEY),
  );
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const resuming = isOAuthReturn();

  useEffect(() => {
    // On a fresh visit (not returning from an OAuth redirect like TD's login),
    // always fetch a new link token — a stale stored one won't be valid.
    if (resuming) return;
    createLinkToken()
      .then((res) => {
        sessionStorage.setItem(LINK_TOKEN_STORAGE_KEY, res.link_token);
        setLinkToken(res.link_token);
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    receivedRedirectUri: resuming ? window.location.href : undefined,
    onSuccess: async (publicToken) => {
      setLinking(true);
      try {
        await exchangePublicToken(publicToken);
        await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to link account");
      } finally {
        sessionStorage.removeItem(LINK_TOKEN_STORAGE_KEY);
        setLinking(false);
        window.history.replaceState({}, "", window.location.pathname);
      }
    },
    onExit: (err) => {
      if (err) setError(err.error_message ?? err.display_message ?? "Link exited with an error");
      sessionStorage.removeItem(LINK_TOKEN_STORAGE_KEY);
      if (resuming) window.history.replaceState({}, "", window.location.pathname);
    },
  });

  // When returning from an OAuth redirect (e.g. TD's login), Link must reopen
  // itself automatically — there's no button click to trigger it this time.
  useEffect(() => {
    if (resuming && ready) open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resuming, ready]);

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (resuming) {
    return <p className="text-sm text-[#8b949e]">Finishing connection...</p>;
  }

  return (
    <button
      onClick={() => open()}
      disabled={!ready || !linkToken || linking}
      className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
    >
      {linking ? "Linking..." : "Connect an account"}
    </button>
  );
}
