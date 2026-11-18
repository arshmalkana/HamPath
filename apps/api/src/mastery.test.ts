import { describe, expect, it } from "vitest";
import { nextState, type QState } from "./mastery.ts";

const day = (n: number, h = 12) => new Date(Date.UTC(2026, 10, n, h));

describe("mastery rule", () => {
  it("lesson check alone never masters a question", () => {
    let s = nextState(null, { correct: true, context: "check", tryNo: 1, at: day(1) })!;
    expect(s).toMatchObject({ streak: 1, mastered: false });
    s = nextState(s, { correct: true, context: "check", tryNo: 1, at: day(2) })!;
    expect(s).toMatchObject({ streak: 2, mastered: false });
  });

  it("masters after correct on a later day in review", () => {
    let s = nextState(null, { correct: true, context: "check", tryNo: 1, at: day(1) })!;
    s = nextState(s, { correct: true, context: "review", tryNo: 1, at: day(2) })!;
    expect(s).toMatchObject({ streak: 2, mastered: true });
  });

  it("same-day repeats do not count as a second day", () => {
    let s = nextState(null, { correct: true, context: "check", tryNo: 1, at: day(1, 9) })!;
    s = nextState(s, { correct: true, context: "review", tryNo: 1, at: day(1, 20) })!;
    expect(s).toMatchObject({ streak: 1, mastered: false });
  });

  it("a miss resets the streak and makes the question due now", () => {
    const prev: QState = { mastered: true, streak: 3, lastCorrectAt: day(1), lapses: 0, dueAt: day(9) };
    const s = nextState(prev, { correct: false, context: "review", tryNo: 1, at: day(5) })!;
    expect(s).toMatchObject({ streak: 0, mastered: false, lapses: 1 });
    expect(s.dueAt).toEqual(day(5));
  });

  it("ignores second tries in the lesson check", () => {
    expect(nextState(null, { correct: true, context: "check", tryNo: 2, at: day(1) })).toBeNull();
  });
});
