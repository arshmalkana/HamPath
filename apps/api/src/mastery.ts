/**
 * Per-question learner state after an answer (SPEC §5):
 *  - FSRS-5 schedules the next review (fsrs.ts): correct = Good, wrong = Again.
 *  - Mastered = correct twice in a row on separate days, the second one outside the lesson Check
 *    (in a review, checkpoint or mock). Any miss un-masters the question.
 * Days are UTC days; switch to the learner's timezone when profiles store one.
 */
import { schedule, type MemoryState } from "./fsrs.ts";

export type Context = "check" | "checkpoint" | "review" | "mock" | "placement";

export interface QState {
  mastered: boolean;
  /** Correct answers in a row, counting at most one per day. */
  streak: number;
  lastCorrectAt: Date | null;
  lapses: number;
  dueAt: Date | null;
  stability: number | null;
  difficulty: number | null;
  lastReviewedAt: Date | null;
  reps: number;
}

export interface AttemptFacts {
  correct: boolean;
  context: Context;
  tryNo: number;
  at: Date;
}

const DAY = 86_400_000;
const utcDay = (d: Date) => Math.floor(d.getTime() / DAY);

export const emptyState = (): QState => ({
  mastered: false,
  streak: 0,
  lastCorrectAt: null,
  lapses: 0,
  dueAt: null,
  stability: null,
  difficulty: null,
  lastReviewedAt: null,
  reps: 0,
});

/** Returns the new state, or null when the attempt must not change state (Check second tries). */
export function nextState(prev: QState | null, a: AttemptFacts): QState | null {
  // A second try in the lesson Check comes straight after the Why not? note: log it, don't count it.
  if (a.context === "check" && a.tryNo > 1) return null;

  const p = prev ?? emptyState();
  const memory: MemoryState | null =
    p.stability !== null && p.difficulty !== null && p.lastReviewedAt !== null
      ? {
          stability: p.stability,
          difficulty: p.difficulty,
          lastReviewedAt: p.lastReviewedAt,
          reps: p.reps,
          lapses: p.lapses,
        }
      : null;
  const fsrs = schedule(memory, a.correct ? 3 : 1, a.at);
  const scheduled = {
    dueAt: fsrs.dueAt,
    stability: fsrs.stability,
    difficulty: fsrs.difficulty,
    lastReviewedAt: fsrs.lastReviewedAt,
    reps: fsrs.reps,
    lapses: fsrs.lapses,
  };

  if (!a.correct) {
    return { ...scheduled, mastered: false, streak: 0, lastCorrectAt: p.lastCorrectAt };
  }
  const sameDay = p.streak > 0 && p.lastCorrectAt !== null && utcDay(p.lastCorrectAt) === utcDay(a.at);
  const streak = sameDay ? p.streak : p.streak + 1;
  const mastered = p.mastered || (streak >= 2 && a.context !== "check");
  return { ...scheduled, mastered, streak, lastCorrectAt: sameDay ? p.lastCorrectAt : a.at };
}
