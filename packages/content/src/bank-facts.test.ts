import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DIPOLE_DBI,
  ID_INTERVAL_MIN,
  REGION_HEIGHT_KM,
  SOLAR_CYCLE_YEARS,
  groundWaveKm,
  hopDistance,

  vhfVariables,
  yagiModel,
} from "@hampath/ham-sim";
import { BANK_PATH, parseBank, readContentTree } from "./index.ts";

// Ham-sim models that labs teach from carry figures the exam asks about. Each figure must pick out
// the bank's correct option (options[0]) over every distractor, so a lab can't teach the wrong number.
const bank = new Map(parseBank(readFileSync(BANK_PATH)).questions.map((q) => [q.id, q.optionsEn]));
const options = (id: string) => {
  const o = bank.get(id);
  if (!o) throw new Error(`${id} is not in the bank`);
  return o;
};
/** Leading number of an option ("4 000 km" → 4000). Every option of a question shares one unit. */
const value = (answer: string) => {
  const m = answer.replace(/(\d)[ \u00a0\u202f](?=\d{3}\b)/g, "$1").match(/^\s*(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};

/** The option whose number is nearest to `x`. */
function closest(id: string, x: number): string {
  const scored = options(id).map((o) => ({ o, d: Math.abs((value(o) ?? Number.NaN) - x) }));
  expect(scored.every((s) => Number.isFinite(s.d)), `${id}: every option should be numeric`).toBe(true);
  return scored.reduce((a, b) => (b.d < a.d ? b : a)).o;
}
const right = (id: string) => options(id)[0];

describe("ham-sim figures agree with the bank's correct answers", () => {
  it.each(["B-007-005-002", "B-007-005-009"])("%s: solar cycle length", (id) => {
    expect(closest(id, SOLAR_CYCLE_YEARS)).toBe(right(id));
  });

  it("B-001-013-006: identification interval", () => {
    expect(closest("B-001-013-006", ID_INTERVAL_MIN)).toBe(right("B-001-013-006"));
  });

  it("B-006-009-006: dipole gain over isotropic", () => {
    expect(closest("B-006-009-006", DIPOLE_DBI)).toBe(right("B-006-009-006"));
  });

  it("B-007-003-003 / B-007-003-002: longest single hop off the E and F2 regions", () => {
    expect(closest("B-007-003-003", hopDistance(0, REGION_HEIGHT_KM.E))).toBe(right("B-007-003-003"));
    expect(closest("B-007-003-002", hopDistance(0, REGION_HEIGHT_KM.F2))).toBe(right("B-007-003-002"));
  });

  it("B-006-011-010: Yagi spacing with the best front-to-back", () => {
    const fb = (o: string) =>
      yagiModel({ reflector: 1.05, driven: 1, director: 0.95, spacing: value(o)! }).fb;
    const best = options("B-006-011-010").reduce((a, b) => (fb(b) > fb(a) ? b : a));
    expect(best).toBe(right("B-006-011-010"));
  });

  it("B-007-001-008: the band with the longest ground-wave range", () => {
    const km = (o: string) => groundWaveKm(300 / value(o)!);
    const best = options("B-007-001-008").reduce((a, b) => (km(b) > km(a) ? b : a));
    expect(best).toBe(right("B-007-001-008"));
  });

  it("B-007-007-010 / B-007-007-011: normal VHF reach stays under 800 km; ducting goes beyond", () => {
    expect(right("B-007-007-010")).toBe("800 km");
    expect(right("B-007-007-011")).toBe("Tropospheric ducting");
    expect(vhfVariables({ band: 2, height: 30 })!.reach).toBeLessThan(800);
    expect(vhfVariables({ band: 2, height: 30, inversion: true })!.reach).toBeGreaterThan(800);
  });

  it("B-007-007-006 / B-007-008-009: sporadic E and meteor scatter work on 6 m, not 2 m", () => {
    expect(right("B-007-007-006")).toBe("6 metres");
    expect(right("B-007-008-009")).toBe("6 metres");
    const at = (band: 6 | 2) => vhfVariables({ band, height: 10, sporadicE: true, meteors: true })!;
    expect([at(6).es, at(6).meteorLink, at(2).es, at(2).meteorLink]).toEqual([true, true, false, false]);
  });

  it("B-002-001-011: the repeater lab's default 2 m offset", () => {
    const lab = readContentTree().labs.find((l) => l.id === "LAB-08")!;
    const offset = Math.abs(Number((lab.default_config as { offset: number }).offset));
    expect(closest("B-002-001-011", offset)).toBe(right("B-002-001-011"));
  });
});
