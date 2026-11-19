"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Feedback } from "@hampath/ui";
import { ApiError, api } from "@/lib/api";

/**
 * The sign-in token arrives in the URL fragment (#token=…), which browsers never send to a server,
 * so it stays out of proxy and access logs. It's read once, then removed from the address bar.
 * Older links used ?token=, which the page still accepts.
 */
function takeToken(queryToken: string): string {
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("token");
  if (fromHash || queryToken) window.history.replaceState(null, "", window.location.pathname);
  return fromHash ?? queryToken;
}

export function ConfirmSignIn({ queryToken }: { queryToken: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Read after hydration: the fragment doesn't exist on the server.
    const t = setTimeout(() => {
      const found = takeToken(queryToken);
      setToken(found);
      if (!found) setError("This link is incomplete. Ask for a new one.");
    }, 0);
    return () => clearTimeout(t);
  }, [queryToken]);

  const confirm = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ redirect: string }>("POST", "/auth/magic-link/verify", { token });
      // A full navigation, so every server component renders with the new session.
      window.location.assign(r.redirect);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t reach HamPath. Check your connection and try again.");
      setBusy(false);
    }
  };
  return (
    <div className="form">
      {error && (
        <Feedback tone="bad" title="Not signed in">
          <p>
            {error} <Link href="/sign-in">Get a new link</Link>
          </p>
        </Feedback>
      )}
      <div>
        <Button onClick={() => void confirm()} disabled={busy || !token}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </div>
    </div>
  );
}
