import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BANK_PATH, launchGate, parseBank, readContentTree, validateContent } from "./index.ts";

describe("launch gate (strict mode)", () => {
  const tree = readContentTree();

  it("passes for the real content: 984 questions, 100 complete lessons, 35 built labs", () => {
    const result = validateContent(parseBank(readFileSync(BANK_PATH)), tree, { strict: true });
    expect(result.errors).toEqual([]);
    expect(result.totals).toMatchObject({ questions: 984, taught: 984, whyNotComplete: 984, lessons: 100, authoredLessons: 100 });
    expect(tree.labs).toHaveLength(35);
  });

  it("fails a lesson with no Hook, no Explore step or a missing worked example", () => {
    const [first, second, ...rest] = tree.lessons;
    const noHook = { ...first!, cards: first!.cards.filter((c) => c.front.type !== "hook") };
    const noLab = { ...second!, lab: null };
    const withCalc = rest.find((l) => Object.keys(l.yaml.calculations).length)!;
    const noWorked = { ...withCalc, cards: withCalc.cards.filter((c) => c.front.type !== "worked_example") };
    const errors = launchGate({ ...tree, lessons: [noHook, noLab, noWorked, ...rest.filter((l) => l !== withCalc)] });
    expect(errors.some((e) => e.includes("no Hook card"))).toBe(true);
    expect(errors.some((e) => e.includes("no Explore lab step"))).toBe(true);
    expect(errors.some((e) => e.includes("no worked example"))).toBe(true);
  });

  it("fails an unbuilt or unused lab", () => {
    const labs = tree.labs.map((l) => (l.id === "LAB-01" ? { ...l, component: null } : l));
    const lessons = tree.lessons.filter((l) => l.lab?.lab !== "LAB-31");
    const errors = launchGate({ ...tree, labs, lessons });
    expect(errors.some((e) => e.includes("LAB-01") && e.includes("not built"))).toBe(true);
    expect(errors.some((e) => e.includes("LAB-31") && e.includes("isn't used"))).toBe(true);
  });

  it("allows gaps only when not strict", () => {
    const partial = { ...tree, lessons: tree.lessons.slice(1) };
    const bank = parseBank(readFileSync(BANK_PATH));
    expect(validateContent(bank, partial).errors).toEqual([]);
    expect(validateContent(bank, partial, { strict: true }).errors.length).toBeGreaterThan(0);
  });
});
