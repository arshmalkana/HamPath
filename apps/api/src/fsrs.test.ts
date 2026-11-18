import { describe, expect, it } from "vitest";
import {
  AGAIN_DELAY_MINUTES,
  DEFAULT_WEIGHTS,
  FACTOR,
  forgetStability,
  initialDifficulty,
  initialStability,
  nextDifficulty,
  nextIntervalDays,
  retrievability,
  schedule,
} from "./fsrs.ts";
import { nextState, type Context, type QState } from "./mastery.ts";

const DAY = 86_400_000;
const t0 = new Date(Date.UTC(2026, 10, 1, 12));
const after = (days: number) => new Date(t0.getTime() + days * DAY);

describe("FSRS-5 memory model", () => {
  it("retrievability is 90% after exactly one stability period", () => {
    expect(retrievability(0, 5)).toBe(1);
    expect(retrievability(5, 5)).toBeCloseTo(0.9, 10);
    expect(retrievability(50, 5)).toBeLessThan(0.6);
    expect(FACTOR).toBeCloseTo(19 / 81);
  });

  it("at 90% desired retention the interval equals the stability", () => {
    expect(nextIntervalDays(3.173)).toBe(3);
    expect(nextIntervalDays(15.7)).toBe(16);
    expect(nextIntervalDays(0.2)).toBe(1); // at least a day
  });

  it("first review uses the initial stability and difficulty for the grade", () => {
    expect(initialStability(3)).toBe(DEFAULT_WEIGHTS[2]);
    expect(initialStability(1)).toBe(DEFAULT_WEIGHTS[0]);
    expect(initialDifficulty(1)).toBeGreaterThan(initialDifficulty(3));
    const good = schedule(null, 3, t0);
    expect(good).toMatchObject({ reps: 1, lapses: 0, intervalDays: 3, retrievability: 1 });
    expect(good.dueAt).toEqual(after(3));
  });

  it("a miss comes back the same day", () => {
    const again = schedule(null, 1, t0);
    expect(again.lapses).toBe(1);
    expect(again.dueAt.getTime() - t0.getTime()).toBe(AGAIN_DELAY_MINUTES * 60_000);
  });

  it("successive on-time Good reviews grow the interval", () => {
    let s = schedule(null, 3, t0);
    const intervals = [s.intervalDays];
    for (let i = 0; i < 4; i++) {
      s = schedule(s, 3, s.dueAt);
      intervals.push(s.intervalDays);
    }
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]!).toBeGreaterThan(intervals[i - 1]!);
    expect(intervals[4]!).toBeGreaterThan(60);
  });

  it("a lapse cuts stability, never raises it, and raises difficulty", () => {
    const learned = schedule(schedule(null, 3, t0), 3, after(3));
    const lapsed = schedule(learned, 1, after(3 + learned.intervalDays));
    expect(lapsed.stability).toBeLessThan(learned.stability);
    expect(lapsed.difficulty).toBeGreaterThan(learned.difficulty);
    expect(lapsed.lapses).toBe(1);
    expect(forgetStability(5, 2, 0.5)).toBeLessThanOrEqual(2);
  });

  it("keeps difficulty within 1..10", () => {
    let d = 5;
    for (let i = 0; i < 50; i++) d = nextDifficulty(d, 1);
    expect(d).toBeLessThanOrEqual(10);
    for (let i = 0; i < 50; i++) d = nextDifficulty(d, 4);
    expect(d).toBeGreaterThanOrEqual(1);
  });

  it("same-day repeats change stability only a little", () => {
    const first = schedule(null, 3, t0);
    const again = schedule(first, 3, new Date(t0.getTime() + 3_600_000));
    expect(again.stability / first.stability).toBeGreaterThan(1);
    expect(again.stability / first.stability).toBeLessThan(2);
  });

  it("reviewing late (lower retrievability) earns a bigger stability boost", () => {
    const s = schedule(null, 3, t0);
    const onTime = schedule(s, 3, after(3));
    const late = schedule(s, 3, after(12));
    expect(late.retrievability).toBeLessThan(onTime.retrievability);
    expect(late.stability).toBeGreaterThan(onTime.stability);
  });
});

describe("mastery rule with FSRS state", () => {
  const ans = (prev: QState | null, correct: boolean, context: Context, at: Date, tryNo = 1) =>
    nextState(prev, { correct, context, tryNo, at });

  it("lesson Check alone never masters a question", () => {
    let s = ans(null, true, "check", t0)!;
    expect(s).toMatchObject({ streak: 1, mastered: false, reps: 1 });
    s = ans(s, true, "check", after(1))!;
    expect(s).toMatchObject({ streak: 2, mastered: false });
  });

  it("masters after a correct answer on a later day in review, and schedules further out", () => {
    const first = ans(null, true, "check", t0)!;
    const second = ans(first, true, "review", after(3))!;
    expect(second).toMatchObject({ streak: 2, mastered: true, reps: 2 });
    expect(second.dueAt!.getTime()).toBeGreaterThan(first.dueAt!.getTime());
  });

  it("same-day repeats do not count as a second day", () => {
    const first = ans(null, true, "check", t0)!;
    const s = ans(first, true, "review", new Date(t0.getTime() + 8 * 3_600_000))!;
    expect(s).toMatchObject({ streak: 1, mastered: false });
  });

  it("a miss un-masters, resets the streak and is due again today", () => {
    const mastered = ans(ans(null, true, "check", t0)!, true, "review", after(3))!;
    const missed = ans(mastered, false, "mock", after(10))!;
    expect(missed).toMatchObject({ mastered: false, streak: 0, lapses: 1 });
    expect(missed.dueAt!.getTime() - after(10).getTime()).toBe(AGAIN_DELAY_MINUTES * 60_000);
  });

  it("ignores second tries in the lesson Check", () => {
    expect(ans(null, true, "check", t0, 2)).toBeNull();
  });
});
