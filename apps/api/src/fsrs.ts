/**
 * FSRS-5 (Free Spaced Repetition Scheduler) memory model, as published by open-spaced-repetition.
 * Pure functions, no I/O. One "card" = one learner × one question.
 *
 *   R(t, S) = (1 + FACTOR·t/S)^DECAY          retrievability after t days at stability S
 *   interval = S/FACTOR · (r^(1/DECAY) − 1)    days until R falls to the desired retention r
 *
 * Multiple-choice answers map to grades: correct → Good (3), wrong → Again (1).
 */

export type Grade = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

/** FSRS-5 default parameters w0..w18. */
export const DEFAULT_WEIGHTS = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605,
  2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
] as const;

export const DESIRED_RETENTION = 0.9;
export const DECAY = -0.5;
export const FACTOR = 19 / 81; // makes R(S, S) = 0.9
export const MAX_INTERVAL_DAYS = 365 * 5;
/** A lapse comes back in the same day's review. */
export const AGAIN_DELAY_MINUTES = 10;

const DAY_MS = 86_400_000;
const w = DEFAULT_WEIGHTS;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export interface MemoryState {
  stability: number;
  difficulty: number;
  lastReviewedAt: Date;
  reps: number;
  lapses: number;
}

export interface ScheduleResult extends MemoryState {
  dueAt: Date;
  /** Retrievability at the moment of this review (1 for a first review). */
  retrievability: number;
  intervalDays: number;
}

export function retrievability(elapsedDays: number, stability: number): number {
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);
}

export function nextIntervalDays(stability: number, retention = DESIRED_RETENTION): number {
  const days = (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return clamp(Math.round(days), 1, MAX_INTERVAL_DAYS);
}

export function initialStability(g: Grade): number {
  return Math.max(w[g - 1]!, 0.1);
}

export function initialDifficulty(g: Grade): number {
  return clamp(w[4] - Math.exp(w[5] * (g - 1)) + 1, 1, 10);
}

export function nextDifficulty(d: number, g: Grade): number {
  const delta = -w[6] * (g - 3);
  const damped = d + (delta * (10 - d)) / 9; // linear damping (FSRS-5)
  const reverted = w[7] * initialDifficulty(4) + (1 - w[7]) * damped; // mean reversion
  return clamp(reverted, 1, 10);
}

export function recallStability(d: number, s: number, r: number, g: Grade): number {
  const hard = g === 2 ? w[15] : 1;
  const easy = g === 4 ? w[16] : 1;
  return s * (Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp(w[10] * (1 - r)) - 1) * hard * easy + 1);
}

export function forgetStability(d: number, s: number, r: number): number {
  const sf = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r));
  return Math.min(sf, s);
}

/** Reviews less than a day apart (FSRS-5 short-term stability). */
export function shortTermStability(s: number, g: Grade): number {
  return s * Math.exp(w[17] * (g - 3 + w[18]));
}

/** Apply one review with grade `g` at `now` to the previous state (null = first time seen). */
export function schedule(prev: MemoryState | null, g: Grade, now: Date): ScheduleResult {
  let stability: number;
  let difficulty: number;
  let r = 1;
  let lapses = prev?.lapses ?? 0;

  if (!prev) {
    stability = initialStability(g);
    difficulty = initialDifficulty(g);
    if (g === 1) lapses += 1;
  } else {
    const elapsed = (now.getTime() - prev.lastReviewedAt.getTime()) / DAY_MS;
    r = retrievability(elapsed, prev.stability);
    difficulty = nextDifficulty(prev.difficulty, g);
    if (elapsed < 1) {
      stability = shortTermStability(prev.stability, g);
    } else if (g === 1) {
      stability = forgetStability(prev.difficulty, prev.stability, r);
      lapses += 1;
    } else {
      stability = recallStability(prev.difficulty, prev.stability, r, g);
    }
  }
  stability = clamp(stability, 0.1, 36500);

  const intervalDays = g === 1 ? 0 : nextIntervalDays(stability);
  const dueAt = new Date(now.getTime() + (g === 1 ? AGAIN_DELAY_MINUTES * 60_000 : intervalDays * DAY_MS));
  return {
    stability,
    difficulty,
    lastReviewedAt: now,
    reps: (prev?.reps ?? 0) + 1,
    lapses,
    dueAt,
    retrievability: r,
    intervalDays,
  };
}
