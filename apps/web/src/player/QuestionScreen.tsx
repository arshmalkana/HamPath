"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Feedback } from "@hampath/ui";
import { ApiError, api, ensureSession } from "@/lib/api";
import { enqueue, isOffline } from "@/lib/outbox";
import type { AttemptResult, Question } from "@/lib/types";
import { ScreenTitle } from "./screens";

export interface QuestionState {
  tries: number;
  chosen: string | null;
  result: AttemptResult | null;
  wrongIds: string[];
  /** Answered offline: saved in the outbox, marked when the connection returns. */
  queued?: boolean;
}

export const emptyQuestionState: QuestionState = { tries: 0, chosen: null, result: null, wrongIds: [] };

interface Props {
  q: Question;
  number: number;
  total: number;
  state: QuestionState;
  setState: (s: QuestionState) => void;
  onDone: () => void;
  /** "See it again": a card id inside this lesson, or a link elsewhere (review). */
  onSeeAgain?: (cardId: string) => void;
  /** "check" (lesson; hidden answer on a first miss) or "review" (answer revealed at once). */
  context?: "check" | "review";
}

/**
 * Lesson Check question: official wording, four shuffled options (shuffled by the API), graded on
 * the server. First miss: the Why not? note for that option, a "See it again" link, and a second
 * try. Second miss: the correct answer and, for calculations, the worked solution.
 */
export function QuestionScreen({ q, number, total, state, setState, onDone, onSeeAgain, context = "check" }: Props) {
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(0);
  useEffect(() => {
    started.current = Date.now();
  }, []);
  const finished = Boolean(state.queued || (state.result && (state.result.correct || state.result.revealed)));

  const submit = async () => {
    if (!pick) return;
    setBusy(true);
    setError(null);
    const tries = state.tries + 1;
    const body = { question_id: q.id, option_id: pick, context, try: tries, ms_taken: Date.now() - started.current };
    try {
      await ensureSession();
      const result = await api<AttemptResult>("POST", "/attempts", body);
      setState({ tries, chosen: pick, result, wrongIds: result.correct ? state.wrongIds : [...state.wrongIds, pick] });
      if (result.correct || result.revealed) onDone();
      started.current = Date.now();
      setPick(null);
    } catch (e) {
      if (isOffline(e)) {
        // No connection: keep the answer and let the learner carry on; it is marked on reconnect.
        enqueue("POST", "/attempts", body);
        setState({ ...state, tries, chosen: pick, queued: true });
        onDone();
        return;
      }
      setError(e instanceof ApiError ? e.message : "Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const optionState = (id: string) => {
    if (state.result?.correct_option_id === id) return "right";
    if (state.wrongIds.includes(id)) return "wrong";
    return undefined;
  };
  const r = state.result;
  const chosenText = q.options.find((o) => o.id === state.chosen)?.text;
  const correctText = q.options.find((o) => o.id === r?.correct_option_id)?.text;

  return (
    <div className="screen screen-narrow">
      <ScreenTitle kicker={`${context === "review" ? "Review" : "Check"} · question ${number} of ${total}`}>
        {q.stem}
      </ScreenTitle>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="screen"
      >
        <fieldset className="choices" disabled={finished || busy}>
          <legend className="visually-hidden">{q.stem}</legend>
          {q.options.map((o) => {
            const st = optionState(o.id);
            return (
              <label key={o.id} className="choice" data-state={st}>
                <input
                  type="radio"
                  name={q.id}
                  value={o.id}
                  checked={pick === o.id}
                  disabled={finished || state.wrongIds.includes(o.id)}
                  onChange={() => setPick(o.id)}
                />
                <span>{o.text}</span>
                {st && <span className="choice-tag">{st === "right" ? "Correct" : "Your answer"}</span>}
              </label>
            );
          })}
        </fieldset>
        {!finished && (
          <div className="actions" style={{ marginTop: 0 }}>
            <Button type="submit" disabled={!pick || busy}>
              {state.tries ? "Try again" : "Check answer"}
            </Button>
          </div>
        )}
      </form>
      <div aria-live="polite">
        {error && (
          <Feedback tone="bad" title="Not sent">
            <p>{error}</p>
          </Feedback>
        )}
        {state.queued && (
          <Feedback tone="neutral" title="Saved offline">
            <p>Your answer is saved on this device and will be marked when you’re back online.</p>
          </Feedback>
        )}
        {r?.correct && (
          <Feedback tone="good" title={state.tries > 1 ? "Right, second time" : "Correct"}>
            {state.tries > 1 && <p>This one goes into your review queue so it sticks.</p>}
          </Feedback>
        )}
        {r && !r.correct && (
          <Feedback tone="bad" title={r.revealed ? `The answer is: ${correctText}` : "Not quite. One more try."}>
            {r.why_not && (
              <p>
                <strong>Why not "{chosenText}"?</strong> {r.why_not}
              </p>
            )}
            {r.worked_solution && (
              <ol className="steps" aria-label="Worked solution">
                {r.worked_solution.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            )}
            {r.teach_card && (
              <p>
                {r.teach_card.id && onSeeAgain ? (
                  <Button variant="link" onClick={() => onSeeAgain(r.teach_card!.id!)}>
                    See it again: {r.teach_card.title}
                  </Button>
                ) : (
                  <a className="btn-link" href={r.teach_card.href}>
                    See it again: {r.teach_card.title}
                  </a>
                )}
              </p>
            )}
            {r.in_review_queue && r.revealed && <p>Added to your review queue.</p>}
          </Feedback>
        )}
      </div>
    </div>
  );
}
