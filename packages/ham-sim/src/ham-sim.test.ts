import { describe, expect, it } from "vitest";
import {
  approxEqual,
  evaluateGoal,
  formatQuantity,
  goalVariables,
  parallelResistance,
  parseAnswerValue,
  parseQuantity,
  runCalculation,
  seriesResistance,
  solveCircuit,
  solveOhm,
  wavelengthMetres,
  readOhmsLab,
  labVariables,
  CORRECT_BOARD,
  toMorse,
  morseTiming,
} from "./index.ts";

describe("units", () => {
  it.each([
    ["10m", "A", 0.01],
    ["10 mA", undefined, 0.01],
    ["2.2k", "Ω", 2200],
    ["4.7 kΩ", undefined, 4700],
    ["300 milliamperes", undefined, 0.3],
    ["0.44 amperes", undefined, 0.44],
    ["9 000 ohms", undefined, 9000],
    ["1,5 volt", undefined, 1.5],
    ["5", "V", 5],
    ["100 µF", undefined, 100e-6],
    ["2 m", "m", 2],
  ] as const)("parses %s", (text, unit, value) => {
    const q = parseQuantity(text, unit);
    expect(q).not.toBeNull();
    expect(q!.value).toBeCloseTo(value, 12);
  });

  it("rejects non-numbers", () => {
    expect(parseQuantity("volts")).toBeNull();
    expect(parseQuantity("12 bananas")).toBeNull();
  });

  it("formats with SI prefixes", () => {
    expect(formatQuantity(0.01, "A")).toBe("10 mA");
    expect(formatQuantity(2200, "Ω")).toBe("2.2 kΩ");
    expect(formatQuantity(0.1 + 0.2, "V")).toBe("300 mV");
    expect(formatQuantity(22, "V")).toBe("22 V");
  });

  it("approxEqual uses relative tolerance", () => {
    expect(approxEqual(100, 101.9)).toBe(true);
    expect(approxEqual(100, 103)).toBe(false);
  });
});

describe("Ohm's Law against Basic exam questions (lesson 5.04)", () => {
  // [question id, given, expected answer text]
  const cases: [string, Parameters<typeof solveOhm>[0], string][] = [
    ["B-005-004-001", { I: 0.5, R: 2 }, "1.0 volts"],
    ["B-005-004-005", { E: 12, I: 0.25 }, "48 ohms"],
    ["B-005-004-006", { E: 9, I: 0.01 }, "900 ohms"],
    ["B-005-004-007", { I: 0.44, R: 50 }, "22 volts"],
    ["B-005-004-008", { E: 6, R: 30 }, "0.2 amperes"],
    ["B-005-004-009", { I: 0.2, R: 25 }, "5 volts"],
    ["B-005-004-011", { E: 3, I: 0.3 }, "10 ohms"],
  ];
  it.each(cases)("%s", (_id, given, answer) => {
    const sol = solveOhm(given);
    expect(approxEqual(sol.value, parseAnswerValue(answer)!)).toBe(true);
  });

  it("produces worked steps", () => {
    expect(solveOhm({ E: 9, I: 0.01 }).steps).toEqual(["R = E ÷ I", "R = 9 V ÷ 0.01 A", "R = 900 Ω"]);
  });

  it("adds a unit-conversion step for prefixed givens", () => {
    const sol = runCalculation({ calc: "ohm", given: { I: "200 mA", R: "25 ohms" } });
    expect(sol.value).toBeCloseTo(5);
    expect(sol.steps[0]).toBe("200 mA = 0.2 A");
  });

  it("requires exactly two knowns", () => {
    expect(() => solveOhm({ E: 1 })).toThrow();
  });
});

describe("circuits", () => {
  it("series and parallel resistance", () => {
    expect(seriesResistance([10, 20, 30])).toBe(60);
    expect(parallelResistance([100, 100])).toBe(50);
    expect(parallelResistance([])).toBe(Infinity);
  });

  it("solves a single-resistor circuit", () => {
    const r = solveCircuit({ topology: "single", E: 6, resistors: [30] });
    expect(r.I).toBeCloseTo(0.2);
    expect(r.P).toBeCloseTo(1.2);
  });

  it("open switch means no current", () => {
    const r = solveCircuit({ topology: "single", E: 6, resistors: [30], closed: false });
    expect(r.I).toBe(0);
  });

  it("series divides voltage, parallel divides current", () => {
    const s = solveCircuit({ topology: "series", E: 12, resistors: [4, 8] });
    expect(s.resistors.map((x) => x.E)).toEqual([4, 8]);
    const p = solveCircuit({ topology: "parallel", E: 12, resistors: [4, 12] });
    expect(p.I).toBeCloseTo(4);
    expect(p.resistors.map((x) => x.I)).toEqual([3, 1]);
  });

  it("wavelength", () => {
    expect(wavelengthMetres(146)).toBeCloseTo(2.055, 3);
  });
});

describe("goal expressions", () => {
  it("evaluates comparisons and logic", () => {
    expect(evaluateGoal("closed && approx(I, 0.2)", { closed: true, I: 0.2 })).toBe(true);
    expect(evaluateGoal("closed && approx(I, 0.2)", { closed: false, I: 0.2 })).toBe(false);
    expect(evaluateGoal("E > 5 && abs(I - 0.1) < 0.001", { E: 6, I: 0.1 })).toBe(true);
    expect(evaluateGoal("swr <= 1.2 || !ok", { swr: 2, ok: false })).toBe(true);
    expect(evaluateGoal("1 + 2 * 3 == 7", {})).toBe(true);
    expect(evaluateGoal("-(2 - 5) == 3", {})).toBe(true);
  });

  it("rejects unknown names and unsafe input", () => {
    expect(() => evaluateGoal("x > 1", {})).toThrow(/Unknown variable/);
    expect(() => evaluateGoal("alert(1)", {})).toThrow(/Unknown function/);
    expect(() => evaluateGoal("a.b", { a: 1 })).toThrow();
    expect(() => evaluateGoal("I > ", { I: 1 })).toThrow();
  });

  it("lists variables", () => {
    expect(goalVariables("closed && approx(I, 0.2) && E < max(R, 3)").sort()).toEqual(["E", "I", "R", "closed"]);
  });
});

describe("LAB-20 breadboard", () => {
  const base = { topology: "single" as const, E: 6, resistors: [30], closed: true };

  it("prebuilt board behaves like the plain circuit", () => {
    expect(readOhmsLab(base)).toMatchObject({ built: true, fault: null, I: 0.2, V: 6, ammeter: 0.2, voltmeter: 6 });
    expect(readOhmsLab(base).P).toBeCloseTo(1.2);
  });

  it("an empty series socket leaves a gap in the loop", () => {
    const r = readOhmsLab({ ...base, board: { source: "battery", load: "resistor" } });
    expect(r).toMatchObject({ built: false, fault: "gap", I: 0, ammeter: null });
  });

  it("a voltmeter in series blocks the current and reads the battery", () => {
    const r = readOhmsLab({
      ...base,
      board: { source: "battery", load: "resistor", series: "voltmeter", across: "ammeter" },
    });
    expect(r).toMatchObject({ fault: "voltmeter-in-series", I: 0, voltmeter: 6, ammeter: 0 });
  });

  it("an ammeter across the resistor is a short: the fuse blows", () => {
    const r = readOhmsLab({
      ...base,
      board: { source: "battery", load: "resistor", series: "ammeter", across: "ammeter" },
    });
    expect(r).toMatchObject({ fault: "ammeter-across-load", I: 0 });
  });

  it("exposes goal variables and validates reported state", () => {
    expect(labVariables("LAB-20", { ...base, board: CORRECT_BOARD })).toMatchObject({
      built: true,
      metered: true,
      I: 0.2,
    });
    expect(labVariables("LAB-20", { ...base, board: { source: "resistor" } })).toBeNull();
    expect(labVariables("LAB-20", { ...base, E: -1 })).toBeNull();
    expect(labVariables("LAB-99", base)).toBeNull();
  });
});

describe("Morse", () => {
  it("encodes text", () => {
    expect(toMorse("cq de va3")).toBe("-.-. --.- / -.. . / ...- .- ...--");
  });
  it("uses PARIS timing", () => {
    // PARIS is 50 dot units including the trailing word gap (7); without it, 43.
    const { total } = morseTiming("PARIS", 20);
    expect(total).toBeCloseTo(43 * (1.2 / 20), 6);
  });
});
