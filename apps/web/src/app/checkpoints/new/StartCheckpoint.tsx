"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Feedback } from "@hampath/ui";
import { ApiError, api, ensureSession } from "@/lib/api";

export function StartCheckpoint({ section }: { section: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setBusy(true);
    try {
      await ensureSession();
      const cp = await api<{ id: string }>("POST", `/checkpoints/${section}`);
      router.push(`/checkpoints/${cp.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't start the checkpoint.");
      setBusy(false);
    }
  };
  return (
    <div className="form">
      {error && (
        <Feedback tone="bad" title="Not started">
          <p>{error}</p>
        </Feedback>
      )}
      <div>
        <Button onClick={() => void start()} disabled={busy}>
          {busy ? "Building your checkpoint…" : "Start the checkpoint"}
        </Button>
      </div>
    </div>
  );
}
