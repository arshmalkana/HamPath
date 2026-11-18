import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BANK_PATH, lessonCode, parseBank } from "./index.ts";
import { checkBlueprint, drawMockExam, readBlueprint, seededRandom, type Blueprint, type QuestionsByTopic } from "./blueprint.ts";

const bank = parseBank(readFileSync(BANK_PATH));
const byTopic: QuestionsByTopic = new Map();
for (const q of bank.questions) {
  const code = lessonCode(q.lessonId);
  byTopic.set(code, [...(byTopic.get(code) ?? []), q.id]);
}
const bp = readBlueprint();
const count = (ids: string[], prefix: string) => ids.filter((q) => q.startsWith(prefix)).length;

describe("exam blueprint", () => {
  it("the committed blueprint is valid for the current bank", () => {
    expect(checkBlueprint(bp, byTopic)).toEqual([]);
    expect(bp).toMatchObject({ total_questions: 100, pass_percent: 70, honours_percent: 80 });
  });

  it("draws 100 distinct questions with the per-section counts", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const exam = drawMockExam(bp, byTopic, seededRandom(seed));
      expect(exam).toHaveLength(100);
      expect(new Set(exam).size).toBe(100);
      for (const [sec, n] of Object.entries(bp.sections)) expect(count(exam, `B-00${sec}-`)).toBe(n);
    }
  });

  it("spreads questions across topics: one per topic before any topic gets a second", () => {
    const exam = drawMockExam(bp, byTopic, seededRandom(7));
    const topicsHit = (sec: string) => new Set(exam.filter((q) => q.startsWith(`B-00${sec}-`)).map((q) => q.slice(0, 9)));
    expect(topicsHit("1").size).toBe(20); // 20 questions, 25 topics → 20 different topics
    expect(topicsHit("4").size).toBe(6); // 6 questions, 6 topics → every topic once
    expect(topicsHit("2").size).toBe(9); // 10 questions, 9 topics → every topic, one twice
  });

  it("is deterministic for a seed and varies across seeds", () => {
    expect(drawMockExam(bp, byTopic, seededRandom(42))).toEqual(drawMockExam(bp, byTopic, seededRandom(42)));
    expect(drawMockExam(bp, byTopic, seededRandom(1))).not.toEqual(drawMockExam(bp, byTopic, seededRandom(2)));
  });

  it("honours pinned topic counts", () => {
    const pinned: Blueprint = { ...bp, topics: { "5.04": 3, "1.13": 2 } };
    const exam = drawMockExam(pinned, byTopic, seededRandom(3));
    expect(count(exam, "B-005-004-")).toBe(3);
    expect(count(exam, "B-001-013-")).toBe(2);
    expect(count(exam, "B-005-")).toBe(15);
  });

  it("rejects blueprints that can't be met", () => {
    expect(checkBlueprint({ ...bp, total_questions: 99 }, byTopic)[0]).toMatch(/add up to 100/);
    expect(checkBlueprint({ ...bp, topics: { "5.04": 12 } }, byTopic)[0]).toMatch(/has 11/);
    expect(checkBlueprint({ ...bp, sections: { ...bp.sections, "8": 60 }, total_questions: 154 }, byTopic)[0]).toMatch(/bank has 55/);
    expect(() => drawMockExam({ ...bp, total_questions: 5 }, byTopic)).toThrow(/unusable/);
  });
});
