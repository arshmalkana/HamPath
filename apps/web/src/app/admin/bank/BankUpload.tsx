"use client";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button, Feedback } from "@hampath/ui";
import { api, ApiError } from "@/lib/api";

interface Diff {
  bankVersion: number | null;
  dryRun: boolean;
  questionCount: number;
  added: string[];
  changed: { id: string; fields: string[] }[];
  retired: string[];
  unchanged: number;
  lessonsNeedingReview: string[];
  changes: { id: string; field: string; before: string; after: string }[];
  masteryReset: number;
}

const FIELD: Record<string, string> = {
  stem: "Question",
  correct_answer: "Correct answer",
  distractor_1: "Wrong option 1",
  distractor_2: "Wrong option 2",
  distractor_3: "Wrong option 3",
};
const code = (lessonId: string) => {
  const m = /^B-00(\d)-0(\d\d)$/.exec(lessonId);
  return m ? `${m[1]}.${m[2]}` : lessonId;
};

async function send(text: string, name: string, dryRun: boolean): Promise<Diff> {
  const res = await fetch(`/api/v1/admin/import-bank?dry_run=${dryRun}&source=${encodeURIComponent(name)}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "text/plain" },
    body: text,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const details = (json?.details?.errors as string[] | undefined)?.slice(0, 5).join("; ");
    throw new Error(`${json?.error ?? `Request failed (${res.status})`}${details ? `: ${details}` : ""}`);
  }
  return json as Diff;
}

/** Choose a file, preview the diff (nothing is written), then apply it. */
export function BankUpload() {
  const router = useRouter();
  const inputId = useId();
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [diff, setDiff] = useState<Diff | null>(null);
  const [applied, setApplied] = useState<Diff | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const d = await send(file.text, file.name, dryRun);
      if (dryRun) setDiff(d);
      else {
        setApplied(d);
        setDiff(null);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "That didn’t work.");
    } finally {
      setBusy(false);
    }
  };
  const nothing = diff && !diff.added.length && !diff.changed.length && !diff.retired.length;

  return (
    <div className="form">
      <div className="field">
        <label className="field-label" htmlFor={inputId}>
          ISED bank file (semicolon-delimited .txt)
        </label>
        <input
          id={inputId}
          className="input"
          type="file"
          accept=".txt,text/plain"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            setDiff(null);
            setApplied(null);
            setError(null);
            setFile(f ? { name: f.name, text: await f.text() } : null);
          }}
        />
      </div>
      <div className="actions">
        <Button variant="quiet" disabled={!file || busy} onClick={() => void run(true)}>
          {busy && !diff ? "Comparing…" : "Preview the changes"}
        </Button>
      </div>

      {error && (
        <Feedback tone="bad" title="Not imported">
          <p>{error}</p>
        </Feedback>
      )}

      {applied && (
        <Feedback
          tone="good"
          title={applied.bankVersion ? `Version ${applied.bankVersion} is live` : "Nothing to apply"}
        >
          <p>
            {applied.added.length} added, {applied.changed.length} changed, {applied.retired.length} removed.{" "}
            {applied.lessonsNeedingReview.length} lesson{applied.lessonsNeedingReview.length === 1 ? "" : "s"} put up
            for review below.
          </p>
        </Feedback>
      )}

      {diff && (
        <section className="bank-diff" aria-labelledby="diff-title">
          <h3 className="section-title" id="diff-title">
            {nothing ? "No changes: this file matches the live bank" : "What this file would change"}
          </h3>
          <dl className="readouts-row bank-counts">
            {(
              [
                ["Questions", diff.questionCount],
                ["Added", diff.added.length],
                ["Changed", diff.changed.length],
                ["Removed", diff.retired.length],
                ["Unchanged", diff.unchanged],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="bank-count">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {diff.added.length > 0 && (
            <p>
              <strong>Added:</strong> {diff.added.join(", ")}
            </p>
          )}
          {diff.retired.length > 0 && (
            <p>
              <strong>Removed:</strong> {diff.retired.join(", ")}. Past answers to them are kept.
            </p>
          )}
          {diff.changes.length > 0 && (
            <ol className="misses">
              {diff.changes.map((c) => (
                <li key={`${c.id}-${c.field}`} className="miss">
                  <p className="miss-stem">
                    {c.id}: {FIELD[c.field] ?? c.field}
                  </p>
                  <p>
                    <span className="miss-label">Before</span> <del>{c.before || "(none)"}</del>
                  </p>
                  <p>
                    <span className="miss-label">After</span> <ins>{c.after}</ins>
                  </p>
                </li>
              ))}
            </ol>
          )}
          {diff.lessonsNeedingReview.length > 0 && (
            <p>
              <strong>Lessons to review:</strong> {diff.lessonsNeedingReview.map(code).join(", ")}
            </p>
          )}
          {diff.masteryReset > 0 && (
            <p>
              {diff.masteryReset} learner{diff.masteryReset === 1 ? "’s" : "s’"} mastery will be reset where a
              question’s wording or correct answer changed, so they see it again in Daily Review.
            </p>
          )}
          {!nothing && (
            <div className="actions">
              <Button disabled={busy} onClick={() => void run(false)}>
                {busy ? "Applying…" : "Apply this update"}
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export function ResolveReview({ id, label }: { id: number; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="link"
      disabled={busy}
      aria-label={`Mark reviewed: ${label}`}
      onClick={async () => {
        setBusy(true);
        try {
          await api("POST", `/admin/card-reviews/${id}/resolve`);
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      Mark reviewed
    </Button>
  );
}
