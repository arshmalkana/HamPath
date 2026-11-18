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
  unitSliderVariables,
  combineVariables,
  scopeVariables,
  bandName,
  dbLadderVariables,
  transformerVariables,
  resonanceVariables,
  meterLabVariables,
  ohmsLabVariables,
  colourCodeValue,
  colourCodeVariables,
  benchVariables,
  diodeCurrent,
  fetDrainCurrent,
  triodePlateCurrent,
  blockDiagramVariables,
  spectrumVariables,
  fractionPassed,
  yagiVariables,
  ssbDriveVariables,
  keyerVariables,
  powerBenchVariables,
  wireDrop,
  inspectorVariables,
  powerDensity,
  rfExposureVariables,
  resultMatches,
  occupiedBandwidth,
  coaxZ0,
  openWireZ0,
  feedlineVariables,
  swrVariables,
  dipoleVariables,
  verticalVariables,
  loopVariables,
  patternVariables,
  patternField,
  ionization,
  hopDistance,
  ionosphereVariables,
  solarCycleVariables,
  vhfVariables,
  mapPathVariables,
  distanceKm,
  bearing,
  interferenceVariables,
  filterResponse,
  filterVariables,
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

describe("section 5 lab models", () => {
  it("LAB-19 unit slider restates the configured quantity", () => {
    expect(unitSliderVariables({ exp: 3 }, { quantity: "3.525 MHz", unit: "Hz" })).toMatchObject({
      exp: 3,
      mantissa: 3525,
    });
    expect(unitSliderVariables({ exp: 2 }, { quantity: "3.525 MHz", unit: "Hz" })).toBeNull();
  });
  it("LAB-20 combiner: capacitors do the opposite of coils", () => {
    expect(combineVariables({ kind: "L", arrangement: "series", values: [0.012, 0.012] })!.total).toBeCloseTo(0.024);
    expect(combineVariables({ kind: "L", arrangement: "parallel", values: [0.02, 0.02] })!.total).toBeCloseTo(0.01);
    expect(combineVariables({ kind: "C", arrangement: "series", values: [20e-6, 20e-6] })!.total).toBeCloseTo(10e-6);
    expect(combineVariables({ kind: "C", arrangement: "parallel", values: [24e-6, 24e-6] })!.ratio).toBeCloseTo(2);
  });
  it("LAB-21 scope: period, wavelength, reactance", () => {
    const v = scopeVariables({ f: 7.125e6, harmonic: false, phase: 0, L: 10e-6 })!;
    expect(v.T).toBeCloseTo(1 / 7.125e6);
    expect(v.wavelength).toBeCloseTo(42.1, 1);
    expect(v.hf).toBe(true);
    expect(v.XL).toBeCloseTo(2 * Math.PI * 7.125e6 * 10e-6);
    expect(bandName(7.125e6)).toBe("HF");
  });
  it("LAB-22 dB ladder", () => {
    expect(dbLadderVariables({ P0: 2, stages: [9] })!.Pout).toBeCloseTo(15.9, 1);
    expect(dbLadderVariables({ P0: 100, stages: [-3, -3] })!.Pout).toBeCloseTo(25.1, 1);
  });
  it("LAB-23 transformer: power in = power out", () => {
    const v = transformerVariables({ Np: 1000, Ns: 100, Vp: 120, Rload: 2.4 })!;
    expect(v.Vs).toBeCloseTo(12);
    expect(v.Is).toBeCloseTo(5);
    expect(v.Ip).toBeCloseTo(0.5);
    expect(v.Pin).toBeCloseTo(v.Pout as number);
  });
  it("LAB-24 resonance: series dips, parallel peaks at f0", () => {
    const base = { L: 5e-6, C: 100e-12, R: 2 };
    const f0 = resonanceVariables({ ...base, circuit: "series", f: 7e6 })!.f0 as number;
    const s = resonanceVariables({ ...base, circuit: "series", f: f0 })!;
    const p = resonanceVariables({ ...base, circuit: "parallel", f: f0 })!;
    expect(s.atResonance).toBe(true);
    expect(s.Z).toBeCloseTo(2, 3);
    expect(p.Z as number).toBeGreaterThan(10_000);
  });
  it("LAB-25 meter lab judges meter placement", () => {
    const st = { topology: "single" as const, E: 12, resistors: [100], closed: true };
    expect(meterLabVariables({ ...st, board: CORRECT_BOARD })).toMatchObject({
      metersCorrect: true,
      ammeter: 0.12,
      voltmeter: 12,
    });
    expect(
      meterLabVariables({
        ...st,
        board: { source: "battery", load: "resistor", series: "voltmeter", across: "ammeter" },
      }),
    ).toMatchObject({ metersCorrect: false, blocked: true });
  });
  it("labVariables passes config through and rejects unknown labs", () => {
    expect(labVariables("LAB-19", { exp: -3 }, { quantity: "2 V", unit: "V" })).toMatchObject({ mantissa: 2000 });
    expect(
      labVariables("LAB-20", { kind: "R", arrangement: "parallel", values: [100, 100] }, { mode: "combine" }),
    ).toMatchObject({ total: 50 });
  });
});

describe("LAB-20 networks report circuit totals", () => {
  it("series: total power, not the first resistor's", () => {
    const v = ohmsLabVariables({ topology: "series", E: 44.5, resistors: [500, 500], closed: true });
    expect(v.P).toBeCloseTo(1.98, 2);
    expect(v.P1).toBeUndefined();
    expect(v.V1).toBeCloseTo(22.25);
    expect(v.R).toBe(1000);
  });
  it("parallel: total current", () => {
    expect(
      ohmsLabVariables({ topology: "parallel", E: 12, resistors: [100, 100, 100, 100], closed: true }).I,
    ).toBeCloseTo(0.48);
  });
});

describe("section 4 component models", () => {
  it("reads the colour code, including gold and silver multipliers", () => {
    expect(colourCodeValue("red", "violet", "yellow")).toBe(270_000);
    expect(colourCodeValue("brown", "black", "brown")).toBe(100);
    expect(colourCodeValue("yellow", "violet", "gold")).toBeCloseTo(4.7);
    expect(colourCodeValue("orange", "orange", "silver")).toBeCloseTo(0.33);
    const v = colourCodeVariables({ bands: ["brown", "black", "brown", "silver"] })!;
    expect(v).toMatchObject({ R: 100, tol: 10 });
    expect(v.min).toBeCloseTo(90);
    expect(v.max).toBeCloseTo(110);
    expect(colourCodeVariables({ bands: ["brown", "black", "pink" as never, "gold"] })).toBeNull();
  });
  it("parses kilohms and megohms in bank answers", () => {
    expect(parseQuantity("270 kilohms")).toEqual({ value: 270_000, unit: "Ω" });
    expect(parseQuantity("27 megohms")).toEqual({ value: 27_000_000, unit: "Ω" });
  });
  it("runs the colour-code and tolerance calculators", () => {
    expect(runCalculation({ calc: "colour_code", given: { bands: ["red", "violet", "yellow"] } }).value).toBe(270_000);
    const tol = runCalculation({ calc: "tolerance", given: { R: "100 Ω", tol: 10 } });
    expect(tol.value).toBeCloseTo(110);
    expect(tol.steps.join(" ")).toMatch(/90/);
  });
  it("models diodes, Zeners, FETs and triodes", () => {
    expect(diodeCurrent(-5)).toBe(0);
    expect(diodeCurrent(1.6)).toBeCloseTo(0.01);
    expect(diodeCurrent(-6, true)).toBeLessThan(0);
    expect(fetDrainCurrent(0)).toBeCloseTo(0.01);
    expect(fetDrainCurrent(-4)).toBe(0);
    expect(fetDrainCurrent(-1)).toBeGreaterThan(fetDrainCurrent(-2));
    expect(triodePlateCurrent(0)).toBeCloseTo(0.02);
    expect(triodePlateCurrent(-8)).toBe(0);
  });
  it("reports bench states: saturation, cut-off, clipping, regulation", () => {
    expect(benchVariables({ device: "bjt", mode: "iv", input: 0.0002 })).toMatchObject({
      saturated: true,
      current: 0.012,
    });
    expect(benchVariables({ device: "bjt", mode: "iv", input: 0 })).toMatchObject({ cutoff: true, current: 0 });
    expect(benchVariables({ device: "bjt", mode: "amp", input: 0, drive: 0.5 })).toMatchObject({
      distorted: false,
      outputPeak: 5,
    });
    expect(benchVariables({ device: "bjt", mode: "amp", input: 0, drive: 1.5 })).toMatchObject({
      distorted: true,
      outputPeak: 10,
    });
    expect(benchVariables({ device: "zener", mode: "iv", input: -6 })).toMatchObject({
      regulating: true,
      conducting: true,
    });
    expect(benchVariables({ device: "laser" as never, mode: "iv", input: 0 })).toBeNull();
    expect(labVariables("LAB-17", { device: "diode", mode: "iv", input: 1 })).toMatchObject({
      conducting: true,
      forward: true,
    });
    expect(labVariables("LAB-18", { bands: ["red", "red", "red", "gold"], score: 3 })).toMatchObject({
      R: 2200,
      score: 3,
    });
  });
});

describe("section 3 lab models", () => {
  const diagram = {
    mode: "build" as const,
    blocks: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
    ],
    slots: [{ accepts: "a", fixed: true }, { accepts: "b" }, { accepts: "c", feeds: 1 }],
  };
  it("grades block diagrams from the trusted config, ignoring fixed slots", () => {
    expect(blockDiagramVariables({ slots: [null, "b", "c"] }, diagram)).toMatchObject({
      placed: 2,
      total: 2,
      complete: true,
      wrong: 0,
    });
    expect(blockDiagramVariables({ slots: [null, "c", "b"] }, diagram)).toMatchObject({
      placed: 0,
      wrong: 2,
      complete: false,
    });
    expect(
      blockDiagramVariables({ slots: [], selected: "b" }, { ...diagram, mode: "identify", target: "b" }),
    ).toMatchObject({ found: true });
    expect(
      blockDiagramVariables({ slots: [], selected: "a" }, { ...diagram, mode: "identify", target: "b" }),
    ).toMatchObject({ found: false });
  });
  it("works out how much of a signal a filter passes", () => {
    expect(fractionPassed(2400, 0, 2400)).toBe(1);
    expect(fractionPassed(2400, 0, 250)).toBeCloseTo(250 / 2400);
    expect(spectrumVariables({ mode: "ssb", filter: 250, tune: 0 })).toMatchObject({ lost: true });
    expect(spectrumVariables({ mode: "cw", filter: 250, tune: 0 }, { qrm: { mode: "cw", offset: 300 } })).toMatchObject(
      { qrm: 0, passed: 1 },
    );
    expect(
      spectrumVariables({ mode: "cw", filter: 500, tune: 0 }, { qrm: { mode: "cw", offset: 300 } })!.qrm,
    ).toBeGreaterThan(0.1);
    expect(spectrumVariables({ mode: "ssb", filter: 2400, tune: 150 })).toMatchObject({ natural: false });
    expect(spectrumVariables({ mode: "cw", filter: 2400, tune: 150 })).toMatchObject({ natural: true });
    expect(spectrumVariables({ mode: "nope" as never, filter: 1, tune: 0 })).toBeNull();
  });
  it("makes a Yagi beam only with a long reflector and short director", () => {
    expect(yagiVariables({ mode: "yagi", reflector: 1.05, driven: 1, director: 0.95, feed: "driven" })).toMatchObject({
      reflecting: true,
      directing: true,
      reflectorLongest: true,
      directorShortest: true,
      fedDriven: true,
      fb: 20,
    });
    expect(yagiVariables({ mode: "yagi", reflector: 1, driven: 1, director: 1, feed: "reflector" })).toMatchObject({
      gain: 0,
      fedDriven: false,
    });
  });
  it("finds the superhet local oscillator frequency", () => {
    expect(
      runCalculation({ calc: "superhet", given: { f: "3.54 MHz", if: "455 kHz", lo: "above" } }).value,
    ).toBeCloseTo(3.995e6);
    expect(runCalculation({ calc: "superhet", given: { f: "14.2 MHz", if: "9 MHz", lo: "below" } }).value).toBeCloseTo(
      5.2e6,
    );
  });
});

describe("section 3 station models", () => {
  it("drives SSB: ALC over range means splatter; heavy processing distorts", () => {
    expect(ssbDriveVariables({ mic: 0.95, processor: 0 }, { rated: 100 })).toMatchObject({
      alcOver: true,
      splatter: true,
    });
    expect(ssbDriveVariables({ mic: 0.6, processor: 0 }, { rated: 100 })).toMatchObject({
      alcOver: false,
      pep: 100,
      avg: 20,
    });
    expect(ssbDriveVariables({ mic: 0.6, processor: 1 }, { rated: 100 })).toMatchObject({ avg: 40, distorted: false });
    expect(ssbDriveVariables({ mic: 0.6, processor: 2 }, { rated: 100 })).toMatchObject({ distorted: true });
  });
  it("checks keyed Morse against the target and grades straight-key timing", () => {
    expect(keyerVariables({ keyer: true, sent: "-.-" }, { target: "K" })).toMatchObject({
      correct: true,
      timingError: 0,
    });
    expect(keyerVariables({ keyer: false, sent: "-.-", durations: [3, 1.6, 3] }, { target: "K" })).toMatchObject({
      correct: true,
      clean: false,
    });
    expect(keyerVariables({ keyer: true, sent: "-.- --.-" }, { target: "KQ" })).toMatchObject({ correct: true });
  });
  it("models battery banks, internal resistance and wire drop (both ways)", () => {
    const cfg = { cellV: 12, cellAh: 20, cellR: 0.02 };
    const base = { load: 5, gauge: 10 as const, length: 3, fuse: "battery" as const, supply: "battery" as const };
    expect(powerBenchVariables({ ...base, batteries: 2, wiring: "parallel" }, cfg)).toMatchObject({ V: 12, Ah: 40 });
    expect(powerBenchVariables({ ...base, batteries: 2, wiring: "series" }, cfg)).toMatchObject({ V: 24, Ah: 20 });
    expect(wireDrop(10, 3, 22)).toBeCloseTo(0.42);
    expect(wireDrop(12, 3, 22)).toBeCloseTo(0.66);
    expect(powerBenchVariables({ ...base, batteries: 1, wiring: "parallel", load: 30 }, cfg)!.sag).toBeCloseTo(0.6);
    expect(powerBenchVariables({ ...base, batteries: 1, wiring: "parallel", fuse: "radio" }, cfg)).toMatchObject({
      protected: false,
      fused: true,
    });
  });
  it("grades the safety inspector from the trusted item list", () => {
    const c = {
      items: [
        { id: "a", label: "", hazard: true, why: "" },
        { id: "b", label: "", hazard: false, why: "" },
      ],
    };
    expect(inspectorVariables({ verdicts: { a: "hazard", b: "safe" } }, c)).toMatchObject({
      complete: true,
      hazardsFound: 1,
    });
    expect(inspectorVariables({ verdicts: { a: "safe", b: "safe" } }, c)).toMatchObject({ complete: false, wrong: 1 });
  });
  it("falls off with the square of distance", () => {
    expect(powerDensity(50, 13, 2) / powerDensity(50, 13, 4)).toBeCloseTo(4);
    expect(rfExposureVariables({ distance: 7 }, { power: 50, gainDbi: 13, limit: 1.7 })).toMatchObject({ safe: true });
  });
  it("uses Carson's rule for FM and widens unshaped CW", () => {
    expect(occupiedBandwidth({ mode: "fm", deviation: 5000 })).toBe(16000);
    expect(occupiedBandwidth({ mode: "cw", shaped: false })).toBeGreaterThan(1000);
  });
  it("matches multi-value and tight-tolerance calculations", () => {
    const bank = runCalculation({ calc: "battery_bank", given: { V: "12 V", Ah: 20, count: 2, wiring: "parallel" } });
    expect(resultMatches("12 volts, 40 ampere-hours", bank)).toBe(true);
    expect(resultMatches("24 volts, 40 ampere-hours", bank)).toBe(false);
    const lsb = runCalculation({ calc: "sideband", given: { f: "7100 kHz", tone: "1000 Hz", sideband: "lsb" } });
    expect(resultMatches("7099 kHz", lsb)).toBe(true);
    expect(resultMatches("7101 kHz", lsb)).toBe(false);
    const g = runCalculation({
      calc: "wire_gauge",
      given: {
        length: "3 m",
        max_drop: "0.5 V",
        table: [
          [14, 0.19],
          [12, 0.11],
          [10, 0.07],
          [8, 0.05],
        ],
      },
    });
    expect(g.value).toBe(10);
  });
});

describe("section 6 feedline and antenna models", () => {
  it("computes Z0 from geometry, independent of length", () => {
    expect(coaxZ0(7, 2, 2.25)).toBeCloseTo(50, 0);
    expect(openWireZ0(45, 2)).toBeCloseTo(456, -1);
    const a = feedlineVariables({ line: "rg58", length: 20, f: 14.2e6 }, { mode: "loss" })!;
    const b = feedlineVariables({ line: "rg58", length: 10, f: 14.2e6 }, { mode: "loss" })!;
    expect(a.Z0).toBe(b.Z0);
    expect(a.lossDb as number).toBeCloseTo(2 * (b.lossDb as number));
  });
  it("loses more at higher frequency and in thinner cable; open-wire is lowest", () => {
    const at = (line: "rg58" | "rg213" | "openwire", f: number) =>
      feedlineVariables({ line, length: 30, f }, { mode: "loss" })!.lossDb as number;
    expect(at("rg58", 440e6)).toBeGreaterThan(at("rg58", 14e6));
    expect(at("rg58", 440e6)).toBeGreaterThan(at("rg213", 440e6));
    expect(at("openwire", 14e6)).toBeLessThan(at("rg213", 14e6));
    expect(
      feedlineVariables({ line: "rg213", length: 20, f: 7e6 }, { mode: "balun", antenna: "dipole" }),
    ).toMatchObject({ commonMode: true });
  });
  it("gives SWR from the mismatch; loss hides it; the tuner and transformers match", () => {
    const base = { r: 50, x: 0, fDesign: 14.2 };
    expect(swrVariables({ length: 1, f: 14.2 }, base)!.swr).toBeCloseTo(1);
    expect(swrVariables({ length: 1, f: 14.2 }, { ...base, r: 150 })!.swr).toBeCloseTo(3);
    expect(swrVariables({ length: 1, f: 14.2, lineLoss: 4 }, { ...base, r: 150 })!.stationSwr as number).toBeLessThan(
      1.5,
    );
    expect(
      swrVariables({ length: 1, f: 14.2, tuner: { xl: 100, xc: 100 } }, { ...base, r: 200, x: 100 })!.rigSwr,
    ).toBeCloseTo(1);
    expect(swrVariables({ length: 1, f: 14.2, ratio: 6 }, { ...base, r: 300 })!.rigSwr).toBeCloseTo(1);
    expect(swrVariables({ length: 1, f: 14.2 }, { ...base, fault: "open" })).toMatchObject({ foldback: true });
  });
  it("uses the exam's length rules", () => {
    expect(dipoleVariables({ mode: "dipole", f: 3.6, length: 143 / 3.6, orientation: "ns" })).toMatchObject({
      resonant: true,
      beamEW: true,
    });
    expect(dipoleVariables({ mode: "dipole", f: 3.6, length: 36.7, orientation: "ns" })).toMatchObject({
      tooShort: true,
    });
    expect(verticalVariables({ mode: "vertical", f: 21.125, length: 3.37, radials: "drooping" })).toMatchObject({
      resonant: true,
      feedZ: 50,
    });
    expect(
      verticalVariables(
        { mode: "vertical", f: 3.75, length: 2, radials: "drooping", coil: 64 },
        { whipReactance: 1500 },
      ),
    ).toMatchObject({ resonant: true });
    expect(loopVariables({ mode: "loop", f: 7.15, perimeter: 42.8, shape: "quad", feed: "side" })).toMatchObject({
      resonant: true,
      horizontal: false,
    });
  });
  it("shapes patterns: isotropic sphere, dipole null off the ends, director pulls forward", () => {
    const iso = { antenna: "isotropic" as const, orientation: "horizontal" as const };
    expect(patternField(iso, 1, 0, 0)).toBe(patternField(iso, 0, 1, 0));
    const dip = { antenna: "dipole" as const, orientation: "horizontal" as const };
    expect(patternField(dip, 1, 0, 0)).toBeCloseTo(0);
    expect(patternField(dip, 0, 0, 1)).toBeCloseTo(1);
    const dir = { ...dip, parasitic: "director" as const };
    expect(patternField(dir, 0, 0, 1)).toBeGreaterThan(patternField(dir, 0, 0, -1));
    expect(patternVariables({ ...dip, rx: "vertical" })).toMatchObject({
      matched: false,
      received: -20,
      gainDbi: 2.15,
    });
  });
  it("matches centimetre and multi-figure length answers", () => {
    expect(parseQuantity("67 cm")).toEqual({ value: 0.67, unit: "m" });
    expect(resultMatches("42.80 metres", runCalculation({ calc: "antenna", given: { k: 306, f: "7.15 MHz" } }))).toBe(
      true,
    );
    expect(resultMatches("41.96 metres", runCalculation({ calc: "antenna", given: { k: 306, f: "7.15 MHz" } }))).toBe(
      false,
    );
  });
});

describe("section 7 propagation models", () => {
  it("peaks ionization at midday and bottoms out just before dawn", () => {
    const hours = Array.from({ length: 48 }, (_, i) => i / 2);
    const vals = hours.map(ionization);
    expect(hours[vals.indexOf(Math.max(...vals))]).toBe(12);
    const min = hours[vals.indexOf(Math.min(...vals))]!;
    expect(min).toBeGreaterThanOrEqual(5);
    expect(min).toBeLessThanOrEqual(6);
  });
  it("gives about 4000 km per F2 hop and 2000 km per E hop at low angles", () => {
    expect(hopDistance(0, 300)).toBeGreaterThan(3700);
    expect(hopDistance(0, 300)).toBeLessThan(4200);
    expect(hopDistance(0, 90)).toBeGreaterThan(1900);
    expect(hopDistance(0, 90)).toBeLessThan(2300);
    expect(hopDistance(30, 300)).toBeLessThan(hopDistance(10, 300));
    expect(hopDistance(10, 400)).toBeGreaterThan(hopDistance(10, 300));
  });
  it("absorbs the low bands by day, and returns them at night", () => {
    expect(ionosphereVariables({ f: 1.8, angle: 20, hour: 12 })).toMatchObject({ absorbed: true });
    expect(ionosphereVariables({ f: 1.8, angle: 20, hour: 0 })).toMatchObject({ absorbed: false, refracted: true });
    expect(ionosphereVariables({ f: 146, angle: 20, hour: 12 })).toMatchObject({ escapes: true });
    expect(ionosphereVariables({ f: 1.8, angle: 20, hour: 12 })!.groundWave as number).toBeGreaterThan(200);
  });
  it("opens 10 m near solar maximum and keeps 20 m open all cycle", () => {
    expect(solarCycleVariables({ year: 0 })).toMatchObject({ open10: false, open20: true });
    expect(solarCycleVariables({ year: 5.5 })).toMatchObject({ open10: true, open20: true });
  });
  it("models VHF modes", () => {
    expect(vhfVariables({ band: 2, height: 10, inversion: true })).toMatchObject({ ducting: true });
    expect(vhfVariables({ band: 2, height: 10, sporadicE: true })).toMatchObject({ es: false });
    expect(vhfVariables({ band: 6, height: 10, sporadicE: true })).toMatchObject({ es: true });
    expect(vhfVariables({ band: 2, height: 10, aurora: true, heading: 350 })).toMatchObject({ auroraLink: true });
  });
  it("works out path MUF, distance and bearing", () => {
    const cfg = { from: [-75.7, 45.4] as [number, number], to: [-0.1, 51.5] as [number, number], sfi: 150 };
    expect(mapPathVariables({ utc: 14.5, f: 28 }, cfg)).toMatchObject({ open: true });
    expect(mapPathVariables({ utc: 2, f: 28 }, cfg)).toMatchObject({ open: false, aboveMuf: true });
    expect(distanceKm(cfg.from, cfg.to)).toBeGreaterThan(5200);
    expect(distanceKm(cfg.from, cfg.to)).toBeLessThan(5500);
    expect(bearing(cfg.from, cfg.to)).toBeGreaterThan(40);
    expect(bearing(cfg.from, cfg.to)).toBeLessThan(60);
  });
});

describe("section 8 interference models", () => {
  it("needs both the right diagnosis and the right cure", () => {
    const c = { cause: "harmonics" as const, cure: "lpfTx" as const };
    expect(interferenceVariables({ diagnosis: "harmonics", cure: "lpfTx" }, c)).toMatchObject({ solved: true });
    expect(interferenceVariables({ diagnosis: "harmonics", cure: null }, c)).toMatchObject({
      diagnosed: true,
      solved: false,
    });
    expect(interferenceVariables({ diagnosis: "overload", cure: "lpfTx" }, c)).toMatchObject({ solved: false });
  });
  it("shapes the five filter types", () => {
    expect(filterResponse("lowpass", 10, 40)).toBeGreaterThan(0.99);
    expect(filterResponse("lowpass", 88, 40)).toBeLessThan(0.01);
    expect(filterResponse("highpass", 88, 40)).toBeGreaterThan(0.99);
    expect(filterResponse("bandpass", 14.2, 12, 16)).toBeGreaterThan(0.8);
    expect(filterResponse("notch", 14.3, 14.3)).toBeLessThan(0.001);
    expect(filterResponse("notch", 14.2, 14.3)).toBeGreaterThan(0.9);
    expect(filterResponse("bandreject", 9.6, 9.4, 9.8)).toBeLessThan(0.001);
  });
  it("grades a filter by what it keeps and what it blocks", () => {
    const cfg = { wanted: [7, 14], interferers: [88, 100] };
    expect(filterVariables({ type: "lowpass", f1: 30 }, cfg)).toMatchObject({ ok: true });
    expect(filterVariables({ type: "highpass", f1: 30 }, cfg)).toMatchObject({ ok: false });
  });
});
