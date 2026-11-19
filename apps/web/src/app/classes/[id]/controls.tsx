"use client";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Button, Feedback } from "@hampath/ui";
import { ApiError, api } from "@/lib/api";

type SectionOption = { number: number; title: string };

/** A label tied to its control by id (a wrapping label would fold a select's value into its name). */
function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children(id)}
    </div>
  );
}

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, then?: (r: unknown) => void) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      if (then) then(r);
      else router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That didn’t work. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, router };
}

export function AssignSection({ classId, sections }: { classId: string; sections: SectionOption[] }) {
  const { busy, error, run } = useAction();
  const [section, setSection] = useState(String(sections[0]?.number ?? 1));
  const [due, setDue] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => api("POST", `/classes/${classId}/assignments`, { section, ...(due ? { due_on: due } : {}) }));
  };
  return (
    <form className="form form-row" onSubmit={submit}>
      {error && (
        <Feedback tone="bad" title="Not assigned">
          <p>{error}</p>
        </Feedback>
      )}
      <Field label="Section">
        {(id) => (
          <select id={id} className="select" value={section} onChange={(e) => setSection(e.target.value)}>
            {sections.map((s) => (
              <option key={s.number} value={s.number}>
                {s.number}. {s.title}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Finish by (optional)">
        {(id) => <input id={id} className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />}
      </Field>
      <div>
        <Button type="submit" variant="quiet" disabled={busy}>
          {busy ? "Assigning…" : "Assign"}
        </Button>
      </div>
    </form>
  );
}

export function RemoveAssignment({ classId, section, label }: { classId: string; section: number; label: string }) {
  const { busy, run } = useAction();
  return (
    <Button
      variant="link"
      disabled={busy}
      aria-label={`Unassign ${label}`}
      onClick={() => void run(() => api("DELETE", `/classes/${classId}/assignments/${section}`))}
    >
      Unassign
    </Button>
  );
}

export function StartLive({ classId, sections }: { classId: string; sections: SectionOption[] }) {
  const { busy, error, run, router } = useAction();
  const [section, setSection] = useState("");
  const [count, setCount] = useState("10");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(
      () =>
        api<{ id: string }>("POST", `/classes/${classId}/live`, {
          questions: Number(count),
          ...(section ? { section } : {}),
        }),
      (r) => router.push(`/live/${(r as { id: string }).id}`),
    );
  };
  return (
    <form className="form form-row" onSubmit={submit}>
      {error && (
        <Feedback tone="bad" title="Not started">
          <p>{error}</p>
        </Feedback>
      )}
      <Field label="Questions from">
        {(id) => (
          <select id={id} className="select" value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">Assigned sections (or all)</option>
            {sections.map((s) => (
              <option key={s.number} value={s.number}>
                {s.number}. {s.title}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="How many">
        {(id) => (
          <select id={id} className="select" value={count} onChange={(e) => setCount(e.target.value)}>
            {["5", "10", "15", "20"].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        )}
      </Field>
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? "Starting…" : "Start a live quiz"}
        </Button>
      </div>
    </form>
  );
}
