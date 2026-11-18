import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { answerMatches, runCalculation } from "@hampath/ham-sim";
import { BANK_PATH, parseBank, readContentTree, validateContent } from "./index.ts";

const bank = parseBank(readFileSync(BANK_PATH));
const tree = readContentTree();
const byId = new Map(bank.questions.map((q) => [q.id, q]));
const specs = tree.lessons.flatMap((l) => Object.entries(l.yaml.calculations).map(([id, spec]) => ({ id, spec, lesson: l.yaml.code })));

describe("ham-sim reproduces every calculation answer in the content", () => {
  it("has calculation specs to check", () => {
    expect(specs.length).toBeGreaterThan(40);
  });

  it.each(specs.map((s) => [s.id, s] as const))("%s", (_id, { id, spec }) => {
    const q = byId.get(id)!;
    const sol = runCalculation(spec);
    expect(answerMatches(q.optionsEn[0], sol.value, sol.unit), `${id}: ${sol.value} ${sol.unit} vs "${q.optionsEn[0]}"`).toBe(true);
    for (const wrong of q.optionsEn.slice(1)) {
      expect(answerMatches(wrong, sol.value, sol.unit), `${id}: also matches distractor "${wrong}"`).toBe(false);
    }
    expect(sol.steps.length).toBeGreaterThan(0);
  });

  it("the CI check agrees: no failed calculations", () => {
    const r = validateContent(bank, tree);
    const failed = r.lessons.flatMap((l) => l.questions).filter((q) => q.calc === "failed");
    expect(failed.map((q) => q.id)).toEqual([]);
  });
});
