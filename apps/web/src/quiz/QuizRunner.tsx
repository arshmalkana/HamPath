"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Feedback } from "@hampath/ui";
import type { QuizQuestion } from "./types";

interface Props {
  /** Storage key for the in-progress answers (per quiz id). */
  storageKey: string;
  title: string;
  questions: QuizQuestion[];
  /** Seconds left when the page opened; omit for untimed quizzes. */
  remainingS?: number;
  submitLabel: string;
  onSubmit: (answers: { question_id: string; option_id: string }[]) => Promise<void>;
}

const fmtTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(sec).padStart(2, "0")}`;
};

function loadSaved(key: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}");
  } catch {
    return {};
  }
}

/**
 * Exam-style runner for Section Checkpoints and mock exams: one question at a time, free
 * navigation, answers kept in this browser until submitted, nothing revealed until the end.
 */
export function QuizRunner({ storageKey, title, questions, remainingS, submitLabel, onSubmit }: Props) {
  // The runner only renders in the browser (after its data loads), so storage is safe to read here.
  const [answers, setAnswers] = useState<Record<string, string>>(() => loadSaved(storageKey));
  const [index, setIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(remainingS);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(answers));
    } catch {
      /* storage unavailable: answers live in memory only */
    }
  }, [answers, storageKey]);

  const submit = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(Object.entries(answers).map(([question_id, option_id]) => ({ question_id, option_id })));
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
    } catch (e) {
      submitted.current = false;
      setError(e instanceof Error ? e.message : "Couldn't submit. Your answers are saved; try again.");
      setBusy(false);
    }
  }, [answers, onSubmit, storageKey]);

  // Countdown; announces the last 30, 10, 5 and 1 minutes, auto-submits at zero.
  useEffect(() => {
    if (left === undefined) return;
    if (left <= 0) {
      // Opened after time ran out: hand in what's saved.
      const late = setTimeout(() => void submit(), 0);
      return () => clearTimeout(late);
    }
    const t = setTimeout(() => {
      setLeft(left - 1);
      if (left - 1 <= 0) void submit();
    }, 1000);
    return () => clearTimeout(t);
  }, [left, submit]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [index, reviewing]);

  const announce =
    left !== undefined && [1800, 600, 300, 60].includes(left)
      ? `${left / 60} minute${left === 60 ? "" : "s"} left`
      : "";
  const q = questions[index]!;
  const answered = questions.filter((x) => answers[x.id]).length;
  const go = (i: number) => {
    setReviewing(false);
    setIndex(Math.max(0, Math.min(questions.length - 1, i)));
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="player">
      <header className="player-head">
        <div className="container player-head-inner">
          <div className="player-title-row">
            <p className="player-title">{title}</p>
            <span className="player-count">
              {answered} of {questions.length} answered
              {left !== undefined && (
                <>
                  {" · "}
                  <span
                    className="quiz-timer"
                    data-low={left < 300}
                    role="timer"
                    aria-label={`Time left ${fmtTime(left)}`}
                  >
                    {fmtTime(Math.max(0, left))}
                  </span>
                </>
              )}
            </span>
          </div>
          <nav className="quiz-nav" aria-label="Questions">
            {questions.map((x, i) => (
              <button
                key={x.id}
                type="button"
                className="quiz-dot"
                data-answered={Boolean(answers[x.id])}
                aria-current={i === index && !reviewing ? "step" : undefined}
                aria-label={`Question ${i + 1}${answers[x.id] ? ", answered" : ""}`}
                onClick={() => go(i)}
              >
                {i + 1}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="player-body" id="main">
        <div className="container screen screen-narrow">
          <p className="visually-hidden" aria-live="assertive">
            {announce}
          </p>
          {reviewing ? (
            <>
              <h1 className="screen-title" tabIndex={-1} ref={headingRef}>
                Ready to submit?
              </h1>
              <p className="page-lead">
                {answered === questions.length
                  ? "Every question has an answer."
                  : `${questions.length - answered} question${questions.length - answered === 1 ? " is" : "s are"} unanswered and will count as wrong.`}
              </p>
              {answered < questions.length && (
                <div className="chip-row">
                  {questions.map((x, i) =>
                    !answers[x.id] ? (
                      <button key={x.id} type="button" className="chip" onClick={() => go(i)}>
                        Question {i + 1}
                      </button>
                    ) : null,
                  )}
                </div>
              )}
              {error && (
                <Feedback tone="bad" title="Not submitted">
                  <p>{error}</p>
                </Feedback>
              )}
              <div className="actions">
                <Button onClick={() => void submit()} disabled={busy}>
                  {busy ? "Submitting…" : submitLabel}
                </Button>
                <Button variant="quiet" onClick={() => go(index)}>
                  Back to the questions
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="screen-kicker">
                Question {index + 1} of {questions.length}
              </p>
              <h1 className="screen-title" tabIndex={-1} ref={headingRef}>
                {q.stem}
              </h1>
              <fieldset className="choices">
                <legend className="visually-hidden">{q.stem}</legend>
                {q.options.map((o) => (
                  <label key={o.id} className="choice">
                    <input
                      type="radio"
                      name={q.id}
                      value={o.id}
                      checked={answers[q.id] === o.id}
                      onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
                    />
                    <span>{o.text}</span>
                  </label>
                ))}
              </fieldset>
            </>
          )}
        </div>
      </main>
      {!reviewing && (
        <footer className="player-foot">
          <div className="container player-foot-inner">
            <Button variant="quiet" onClick={() => go(index - 1)} disabled={index === 0}>
              Previous
            </Button>
            <span className="player-foot-status">Nothing is marked until you submit.</span>
            {index + 1 < questions.length ? (
              <Button onClick={() => go(index + 1)}>Next</Button>
            ) : (
              <Button onClick={() => setReviewing(true)}>Review and submit</Button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
