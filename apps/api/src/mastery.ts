/**
 * Mastery rule (SPEC §5): a question is mastered after 2 correct answers in a row on separate
 * days, the second one in a quiz or review (not in the lesson Check right after teaching).
 * Days are UTC days for now; switch to the learner's timezone when profiles store one.
 * Due dates use a fixed ladder until FSRS lands in Phase 1.
 */

export type Context = "check" | "checkpoint" | "review" | "mock" | "placement";

export interface QState {
  mastered: boolean;
  /** Correct answers in a row, counting at most one per day. */
  streak: number;
  lastCorrectAt: Date | null;
  lapses: number;
  dueAt: Date | null;
}

export interface AttemptFacts {
  correct: boolean;
  context: Context;
  tryNo: number;
  at: Date;
}

const DAY = 86_400_000;
const INTERVAL_DAYS = [1, 3, 7, 16, 35, 75];

const utcDay = (d: Date) => Math.floor(d.getTime() / DAY);

/** Returns the new state, or null when the attempt must not change state (Check second tries). */
export function nextState(prev: QState | null, a: AttemptFacts): QState | null {
  // A second try in the lesson Check comes right after seeing the Why not? note: log it, don't count it.
  if (a.context === "check" && a.tryNo > 1) return null;

  const p: QState = prev ?? { mastered: false, streak: 0, lastCorrectAt: null, lapses: 0, dueAt: null };
  if (!a.correct) {
    // Into the review queue now.
    return { mastered: false, streak: 0, lastCorrectAt: p.lastCorrectAt, lapses: p.lapses + 1, dueAt: a.at };
  }
  const sameDay = p.streak > 0 && p.lastCorrectAt !== null && utcDay(p.lastCorrectAt) === utcDay(a.at);
  const streak = sameDay ? p.streak : p.streak + 1;
  const mastered = p.mastered || (streak >= 2 && a.context !== "check");
  const days = INTERVAL_DAYS[Math.min(streak, INTERVAL_DAYS.length) - 1]!;
  return {
    mastered,
    streak,
    lastCorrectAt: sameDay ? p.lastCorrectAt : a.at,
    lapses: p.lapses,
    dueAt: new Date(a.at.getTime() + days * DAY),
  };
}
