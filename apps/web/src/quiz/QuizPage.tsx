"use client";
import { useEffect, useState } from "react";
import { ApiError, api, ensureSession } from "@/lib/api";
import { QuizRunner } from "./QuizRunner";
import { ResultsView } from "./ResultsView";
import type { QuizInProgress, QuizResults } from "./types";

/** Loads a checkpoint or mock by id, runs it, submits it, then shows the results. */
export function QuizPage({ kind, id }: { kind: "checkpoint" | "mock"; id: string }) {
  const base = kind === "mock" ? "/mocks" : "/checkpoints";
  const [data, setData] = useState<QuizInProgress | QuizResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await ensureSession();
        setData(await api<QuizInProgress | QuizResults>("GET", `${base}/${id}`));
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Couldn't load it.");
      }
    })();
  }, [base, id]);

  if (error) {
    return (
      <main className="container page" id="main">
        <div className="notice" role="alert">
          <h2>That didn’t load</h2>
          <p>{error}</p>
        </div>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="container page" id="main" aria-busy="true" aria-label="Loading">
        <div className="skeleton" style={{ height: 36, maxWidth: 420, marginBottom: 24 }} />
        <div className="skeleton" style={{ height: 280 }} />
      </main>
    );
  }
  if (data.finished) return <ResultsView r={data} kind={kind} />;
  return (
    <QuizRunner
      storageKey={`hp-${kind}-${id}`}
      title={kind === "mock" ? "Mock exam" : `Checkpoint${data.title ? `: ${data.title}` : ""}`}
      questions={data.questions}
      remainingS={kind === "mock" ? data.remainingS : undefined}
      submitLabel={kind === "mock" ? "Submit the exam" : "Submit the checkpoint"}
      onSubmit={async (answers) => {
        setData(await api<QuizResults>("POST", `${base}/${id}/submit`, { answers }));
        window.scrollTo({ top: 0 });
      }}
    />
  );
}
