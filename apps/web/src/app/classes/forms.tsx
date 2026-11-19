"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Feedback } from "@hampath/ui";
import { ApiError, api, ensureSession } from "@/lib/api";

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await ensureSession();
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That didn’t work. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

export function JoinClass() {
  const router = useRouter();
  const { busy, error, run } = useSubmit();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const c = await api<{ id: string }>("POST", "/classes/join", {
        code,
        ...(name.trim() ? { display_name: name } : {}),
      });
      router.push(`/classes/${c.id}`);
    });
  };
  return (
    <form className="form" onSubmit={submit}>
      {error && (
        <Feedback tone="bad" title="Not joined">
          <p>{error}</p>
        </Feedback>
      )}
      <label className="field">
        <span className="field-label">Class code</span>
        <input
          className="input"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          pattern="[A-Za-z0-9]{6}"
          aria-describedby="code-help"
        />
        <span className="field-help" id="code-help">
          Six letters and numbers, from your instructor.
        </span>
      </label>
      <label className="field">
        <span className="field-label">Your name for the class (optional)</span>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          autoComplete="name"
        />
      </label>
      <div>
        <Button type="submit" disabled={busy || code.length !== 6}>
          {busy ? "Joining…" : "Join the class"}
        </Button>
      </div>
    </form>
  );
}

export function CreateClass() {
  const router = useRouter();
  const { busy, error, run } = useSubmit();
  const [name, setName] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const c = await api<{ id: string }>("POST", "/classes", { name });
      router.push(`/classes/${c.id}`);
    });
  };
  return (
    <form className="form" onSubmit={submit}>
      {error && (
        <Feedback tone="bad" title="Not created">
          <p>{error}</p>
        </Feedback>
      )}
      <label className="field">
        <span className="field-label">New class name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
      </label>
      <div>
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? "Creating…" : "Create the class"}
        </Button>
      </div>
    </form>
  );
}
