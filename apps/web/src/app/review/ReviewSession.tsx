"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Feedback, PhaseProgress } from "@hampath/ui";
import { ApiError, api, ensureSession } from "@/lib/api";
import type { Question } from "@/lib/types";
import { QuestionScreen, emptyQuestionState, type QuestionState } from "@/player/QuestionScreen";

interface Due {
  dueCount: number;
  estMinutes: number;
  questions: Question[];
}

/** Daily Review (SPEC §5): today's FSRS-due questions, answers revealed at once, 5–15 minutes. */
export function ReviewSession() {
  const [deck, setDeck] = useState<Due | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [states, setStates] = useState<Record<string, QuestionState>>({});
  const [doneSet, setDoneSet] = useState<Set<number>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        await ensureSession();
        setDeck(await api<Due>("GET", "/review/due?limit=20"));
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Couldn't load your review.");
      }
    })();
  }, []);

  if (error) {
    return (
      <main className="container page" id="main">
        <div className="notice" role="alert">
          <h2>Review didn’t load</h2>
          <p>{error}</p>
        </div>
      </main>
    );
  }
  if (!deck) {
    return (
      <main className="container page" id="main" aria-busy="true" aria-label="Loading review">
        <div className="skeleton" style={{ height: 36, maxWidth: 360, marginBottom: 24 }} />
        <div className="skeleton" style={{ height: 240 }} />
      </main>
    );
  }
  if (deck.questions.length === 0) {
    return (
      <main className="container page" id="main">
        <div className="page-head">
          <h1 className="page-title">Nothing to review today</h1>
          <p className="page-lead">
            Questions come back here when the scheduler expects you’re about to forget them. Answer some lesson Checks
            and they’ll start arriving tomorrow.
          </p>
        </div>
        <Link className="btn btn-primary" href="/">
          Back to the dashboard
        </Link>
      </main>
    );
  }

  const total = deck.questions.length;
  const finished = index >= total;
  const correct = Object.values(states).filter((s) => s.result?.correct && s.tries === 1).length;

  return (
    <div className="player">
      <header className="player-head">
        <div className="container player-head-inner">
          <div className="player-title-row">
            <p className="player-title">Daily Review</p>
            <span className="player-count">
              {finished ? `${total} done` : `${index + 1} of ${total}`} · about {deck.estMinutes} min
              {deck.dueCount > total ? ` · ${deck.dueCount - total} more due later` : ""}
            </span>
          </div>
          <PhaseProgress
            label="Review progress"
            phases={[{ label: "Review", fill: Math.min(1, doneSet.size / total), current: true }]}
          />
        </div>
      </header>
      <main className="player-body" id="main">
        <div className="container">
          {finished ? (
            <div className="screen screen-narrow">
              <h1 className="screen-title">Review done</h1>
              <Feedback tone={correct === total ? "good" : "neutral"} title={`${correct} of ${total} right first time`}>
                <p>
                  Each answer moved that question’s next review date: further out when you knew it, back to today when
                  you didn’t.
                </p>
              </Feedback>
              <div className="actions">
                <Link className="btn btn-primary" href="/">
                  Back to the dashboard
                </Link>
              </div>
            </div>
          ) : (
            <QuestionScreen
              key={deck.questions[index]!.id}
              context="review"
              q={deck.questions[index]!}
              number={index + 1}
              total={total}
              state={states[deck.questions[index]!.id] ?? emptyQuestionState}
              setState={(s) => setStates((m) => ({ ...m, [deck.questions[index]!.id]: s }))}
              onDone={() => setDoneSet((d) => new Set(d).add(index))}
            />
          )}
        </div>
      </main>
      {!finished && (
        <footer className="player-foot">
          <div className="container player-foot-inner">
            <Link className="btn btn-quiet" href="/">
              Stop for now
            </Link>
            <Button
              onClick={() => {
                setIndex((i) => i + 1);
                window.scrollTo({ top: 0 });
              }}
              disabled={!doneSet.has(index)}
            >
              {index + 1 === total ? "Finish" : "Next"}
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}
