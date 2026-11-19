"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, Feedback } from "@hampath/ui";
import { ApiError, api, ensureSession } from "@/lib/api";

interface View {
  id: string;
  classId: string;
  state: "lobby" | "question" | "reveal" | "ended";
  number: number;
  total: number;
  members: number;
  isInstructor: boolean;
  question: { id: string; stem: string; options: { id: string; text: string }[] } | null;
  answered?: number;
  myAnswer?: string | null;
  correctOptionId?: string | null;
  counts?: Record<string, number> | null;
  myResult?: boolean | null;
  scores?: { name: string; right: number }[];
  myScore?: number;
}

/** How often phones and the projector check for the next state. */
const POLL_MS = 1500;
const LETTERS = ["A", "B", "C", "D"];

/**
 * Live classroom quiz. The instructor's screen is the projector view (big type, answer counts,
 * the advance button); members see the same question with answer buttons on their phones.
 */
export function LiveQuiz({ id }: { id: string }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      await ensureSession();
      setView(await api<View>("GET", `/live/${id}`));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Lost the connection; retrying…");
    }
  }, [id]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  const act = async (fn: () => Promise<View>) => {
    setBusy(true);
    try {
      setView(await fn());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That didn’t go through. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!view) {
    return (
      <main className="container page" id="main" aria-busy={!error}>
        {error ? (
          <div className="notice" role="alert">
            <h2>Can’t open this quiz</h2>
            <p>
              {error} <Link href="/classes">Classes</Link>
            </p>
          </div>
        ) : (
          <div className="skeleton" style={{ height: 280 }} />
        )}
      </main>
    );
  }

  const v = view;
  const instructor = v.isInstructor;
  const advanceLabel =
    v.state === "lobby"
      ? "Start"
      : v.state === "question"
        ? "Reveal the answer"
        : v.number < v.total
          ? "Next question"
          : "Show the scores";

  return (
    <main className={`container page live${instructor ? " live-projector" : ""}`} id="main">
      <p className="screen-kicker">
        {v.state === "ended"
          ? "Live quiz finished"
          : v.state === "lobby"
            ? "Live quiz"
            : `Question ${v.number} of ${v.total}`}
      </p>

      {error && (
        <p className="field-help" role="status">
          {error}
        </p>
      )}

      {v.state === "lobby" && (
        <>
          <h1 className="page-title">{instructor ? "Ready when you are" : "Get ready"}</h1>
          <p className="page-lead">
            {instructor
              ? `${v.members} learner${v.members === 1 ? "" : "s"} in the class. Learners open this quiz from their class page.`
              : "The first question appears here when your instructor starts."}
          </p>
        </>
      )}

      {v.question && (
        <>
          <h1 className="live-stem">{v.question.stem}</h1>
          <ol className="live-options">
            {v.question.options.map((o, i) => {
              const right = v.correctOptionId === o.id;
              const mine = v.myAnswer === o.id;
              const count = v.counts?.[o.id];
              const state =
                v.state === "reveal" ? (right ? "right" : mine ? "wrong" : undefined) : mine ? "chosen" : undefined;
              return (
                <li key={o.id}>
                  {instructor ? (
                    <div className="live-option" data-state={state}>
                      <span className="live-letter">{LETTERS[i]}</span>
                      <span className="live-text">{o.text}</span>
                      {count !== undefined && (
                        <span className="live-count">
                          {count} <span className="visually-hidden">answered this</span>
                        </span>
                      )}
                      {right && <span className="choice-tag">Correct</span>}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="live-option"
                      data-state={state}
                      aria-pressed={mine}
                      disabled={busy || v.state !== "question" || Boolean(v.myAnswer)}
                      onClick={() =>
                        void act(() =>
                          api<View>("POST", `/live/${v.id}/answer`, { question_id: v.question!.id, option_id: o.id }),
                        )
                      }
                    >
                      <span className="live-letter">{LETTERS[i]}</span>
                      <span className="live-text">{o.text}</span>
                      {right && <span className="choice-tag">Correct</span>}
                      {state === "wrong" && <span className="choice-tag">Your answer</span>}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="live-status" role="status">
            {instructor
              ? v.state === "question"
                ? `${v.answered} of ${v.members} answered`
                : `${v.answered} answered`
              : v.state === "question"
                ? v.myAnswer
                  ? "Answer locked in. Watch the screen."
                  : "Tap your answer."
                : v.myResult === true
                  ? "Right!"
                  : v.myResult === false
                    ? "Not this time. The correct answer is marked."
                    : "You didn’t answer this one."}
          </p>
        </>
      )}

      {v.state === "ended" && (
        <>
          <h1 className="page-title">{instructor ? "Scores" : `You got ${v.myScore} of ${v.total}`}</h1>
          {instructor && v.scores && (
            <ol className="live-scores">
              {v.scores.length ? (
                v.scores.map((s) => (
                  <li key={s.name}>
                    <span>{s.name}</span> <strong>{s.right}</strong>
                  </li>
                ))
              ) : (
                <li>No answers this time.</li>
              )}
            </ol>
          )}
          <Link className="btn btn-quiet" href={`/classes/${v.classId}`}>
            Back to the class
          </Link>
        </>
      )}

      {instructor && v.state !== "ended" && (
        <div className="actions">
          <Button disabled={busy} onClick={() => void act(() => api<View>("POST", `/live/${v.id}/advance`))}>
            {advanceLabel}
          </Button>
        </div>
      )}
      {!instructor && v.state !== "ended" && (
        <Feedback tone="neutral" title="Just for practice">
          <p>Live quiz answers don’t affect your mastery or review schedule.</p>
        </Feedback>
      )}
    </main>
  );
}
