"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Feedback } from "@hampath/ui";
import { ApiError, api, ensureSession } from "@/lib/api";

/** Creates a quiz on the server (POST `create`) and opens it at `${goTo}/${id}`. */
export function StartQuiz({
  create,
  goTo,
  label,
  busyLabel,
}: {
  create: string;
  goTo: string;
  label: string;
  busyLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setBusy(true);
    try {
      await ensureSession();
      const q = await api<{ id: string }>("POST", create);
      router.push(`${goTo}/${q.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't start it.");
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
          {busy ? busyLabel : label}
        </Button>
      </div>
    </div>
  );
}
