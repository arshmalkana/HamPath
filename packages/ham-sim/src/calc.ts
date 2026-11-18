import { solveOhm, solvePower, type OhmVar } from "./ohm.ts";
import { parallelResistance, seriesResistance } from "./resistors.ts";
import { formatNumber, formatQuantity, parseQuantity, roundSig, type Unit } from "./units.ts";
import { capacitiveReactance, inductiveReactance, powerRatioToDb, resonantFrequency } from "./wave.ts";
import {
  POWER_LIMITS,
  bandAt,
  bandByMetres,
  MEASURE_NAMES,
  type PowerMeasure,
  type Qualification,
} from "./regulations.ts";
import {
  COLOURS,
  MULTIPLIER_COLOURS,
  colourCodeValue,
  multiplierOf,
  type Colour,
  type MultiplierColour,
} from "./components.ts";

/**
 * A calculation spec, authored in a lesson's `calculations:` next to the question id. CI runs it
 * and checks the result against the bank's correct answer; after a miss, the learner sees `steps`.
 *
 *   { calc: "ohm", given: { I: "200 mA", R: "25 ohms" } }
 *   { calc: "resistors", given: { parallel: [100, 100, 100, 100], E: 12 }, find: "I" }
 *   { calc: "db", given: { P: 2, db: 9 }, find: "P" }
 */
export interface CalcSpec {
  calc: string;
  given: Record<string, string | number | (string | number | (string | number)[])[]>;
  find?: string;
  /** Unit of the answer when the calculator can't infer it (e.g. "quantity"). */
  unit?: Unit | "";
}

export interface CalcResult {
  value: number;
  unit: Unit | "";
  steps: string[];
  /** Further values the answer must also contain (e.g. volts and ampere-hours). */
  also?: { value: number; unit: Unit | "" }[];
  /** Relative tolerance when matching answers (default 2%); frequencies need far tighter. */
  tolerance?: number;
}

type Given = CalcSpec["given"];
const q = (v: number, u: Unit | "") => formatQuantity(v, u as Unit, 4);
const n = (v: number) => formatNumber(roundSig(v, 4));

/** Parse one given value in `unit` (accepts numbers and strings like "200 mA"). */
function val(given: Given, key: string, unit: Unit | "", steps?: string[]): number | undefined {
  const raw = given[key];
  if (raw === undefined || Array.isArray(raw)) return undefined;
  if (typeof raw === "number") return raw;
  const parsed = parseQuantity(raw, unit === "" ? undefined : unit);
  if (!parsed) throw new Error(`Cannot parse '${raw}' for ${key}`);
  if (unit && parsed.unit && parsed.unit !== unit) throw new Error(`'${raw}' is not in ${unit} for ${key}`);
  const plain = Number(raw.replace(/[^\d.-]/g, ""));
  if (steps && Number.isFinite(plain) && plain !== parsed.value)
    steps.push(`${raw.trim()} = ${n(parsed.value)} ${unit}`.trim());
  return parsed.value;
}

function list(given: Given, key: string, unit: Unit): number[] | undefined {
  const raw = given[key];
  if (!Array.isArray(raw)) return undefined;
  return raw.map((x) => {
    if (typeof x === "number") return x;
    if (Array.isArray(x)) throw new Error(`Nested list in ${key}`);
    const p = parseQuantity(x, unit);
    if (!p) throw new Error(`Cannot parse '${x}' in ${key}`);
    return p.value;
  });
}

const need = <T>(x: T | undefined, what: string): T => {
  if (x === undefined) throw new Error(`Missing ${what}`);
  return x;
};

type Calculator = (s: CalcSpec) => CalcResult;

const calculators: Record<string, Calculator> = {
  /** Ohm's Law for whichever of E, I, R is missing. */
  ohm: (s) => {
    const steps: string[] = [];
    const given: Partial<Record<OhmVar, number>> = {};
    for (const [k, u] of [
      ["E", "V"],
      ["I", "A"],
      ["R", "Ω"],
    ] as const) {
      const v = val(s.given, k, u, steps);
      if (v !== undefined) given[k] = v;
    }
    const sol = solveOhm(given);
    return { value: sol.value, unit: sol.unit, steps: [...steps, ...sol.steps] };
  },

  power: (s) => {
    const steps: string[] = [];
    const sol = solvePower({
      E: val(s.given, "E", "V", steps),
      I: val(s.given, "I", "A", steps),
      R: val(s.given, "R", "Ω", steps),
    });
    return { value: sol.value, unit: sol.unit, steps: [...steps, ...sol.steps] };
  },

  /** Any two of E, I, R, P → the one in `find`. */
  electrical: (s) => {
    const steps: string[] = [];
    const E = val(s.given, "E", "V", steps);
    const I = val(s.given, "I", "A", steps);
    const R = val(s.given, "R", "Ω", steps);
    const P = val(s.given, "P", "W", steps);
    const find = need(s.find, "find");
    if (find === "P") {
      const sol = solvePower({ E, I, R });
      return { value: sol.value, unit: "W", steps: [...steps, ...sol.steps] };
    }
    if (find === "I" && P !== undefined && E !== undefined) {
      const v = P / E;
      return { value: v, unit: "A", steps: [...steps, "I = P ÷ E", `I = ${n(P)} W ÷ ${n(E)} V`, `I = ${q(v, "A")}`] };
    }
    if (find === "E" && P !== undefined && I !== undefined) {
      const v = P / I;
      return { value: v, unit: "V", steps: [...steps, "E = P ÷ I", `E = ${n(P)} W ÷ ${n(I)} A`, `E = ${q(v, "V")}`] };
    }
    if (find === "R" && P !== undefined && E !== undefined) {
      const v = (E * E) / P;
      return {
        value: v,
        unit: "Ω",
        steps: [...steps, "R = E² ÷ P", `R = (${n(E)} V)² ÷ ${n(P)} W`, `R = ${q(v, "Ω")}`],
      };
    }
    const sol = solveOhm({ E, I, R });
    return { value: sol.value, unit: sol.unit, steps: [...steps, ...sol.steps] };
  },

  /** A quantity restated in other units (the answer is compared in base units). */
  quantity: (s) => {
    const unit = (s.unit ?? "") as Unit | "";
    const x = need(val(s.given, "x", unit), "x");
    return { value: x, unit, steps: [`${String(s.given.x)} = ${q(x, unit)}`] };
  },

  /** Series or parallel resistors; optionally with a source E to find I or P. */
  resistors: (s) => {
    const series = list(s.given, "series", "Ω");
    const parallel = list(s.given, "parallel", "Ω");
    const rs = need(series ?? parallel, "series or parallel");
    const R = series ? seriesResistance(rs) : parallelResistance(rs);
    const steps = series
      ? [`R = ${rs.map(n).join(" + ")} Ω`, `R = ${q(R, "Ω")}`]
      : rs.every((r) => r === rs[0])
        ? [`${rs.length} equal resistors in parallel: R = ${n(rs[0]!)} Ω ÷ ${rs.length}`, `R = ${q(R, "Ω")}`]
        : [`1/R = ${rs.map((r) => `1/${n(r)}`).join(" + ")}`, `R = ${q(R, "Ω")}`];
    const find = s.find ?? "R";
    if (find === "R") return { value: R, unit: "Ω", steps };
    const E = need(val(s.given, "E", "V"), "E");
    const I = E / R;
    steps.push(`I = E ÷ R = ${n(E)} V ÷ ${n(R)} Ω = ${q(I, "A")}`);
    if (find === "I") return { value: I, unit: "A", steps };
    const P = E * I;
    steps.push(`P = E × I = ${n(E)} V × ${q(I, "A")} = ${q(P, "W")}`);
    return { value: P, unit: "W", steps };
  },

  /** Inductors add in series and combine like parallel resistors in parallel. */
  inductors: (s) => {
    const series = list(s.given, "series", "H");
    const parallel = list(s.given, "parallel", "H");
    const ls = need(series ?? parallel, "series or parallel");
    const L = series ? seriesResistance(ls) : parallelResistance(ls);
    return {
      value: L,
      unit: "H",
      steps: [
        series
          ? `Inductors in series add: L = ${ls.map((x) => q(x, "H")).join(" + ")}`
          : `Inductors in parallel: 1/L = ${ls.map((x) => `1/${q(x, "H")}`).join(" + ")}`,
        `L = ${q(L, "H")}`,
      ],
    };
  },

  /** Capacitors: the opposite of resistors. Parallel adds; series combines reciprocally. */
  capacitors: (s) => {
    const series = list(s.given, "series", "F");
    const parallel = list(s.given, "parallel", "F");
    const cs = need(series ?? parallel, "series or parallel");
    const C = parallel ? seriesResistance(cs) : parallelResistance(cs);
    return {
      value: C,
      unit: "F",
      steps: [
        parallel
          ? `Capacitors in parallel add: C = ${cs.map((x) => q(x, "F")).join(" + ")}`
          : `Capacitors in series: 1/C = ${cs.map((x) => `1/${q(x, "F")}`).join(" + ")}`,
        `C = ${q(C, "F")}`,
      ],
    };
  },

  /** Equal resistors share power equally, so the safe total is the sum of the ratings. */
  power_rating: (s) => {
    const ratings = need(list(s.given, "ratings", "W"), "ratings");
    const total = ratings.reduce((a, b) => a + b, 0);
    return {
      value: total,
      unit: "W",
      steps: [
        `Equal resistors share the power equally`,
        `Total = ${ratings.map((r) => q(r, "W")).join(" + ")} = ${q(total, "W")}`,
      ],
    };
  },

  /** Decibels: dB = 10 log(P2/P1). find: db | ratio | divisor | P */
  db: (s) => {
    const find = need(s.find, "find");
    const steps: string[] = [];
    if (find === "db") {
      const P1 = val(s.given, "P1", "W");
      const P2 = val(s.given, "P2", "W");
      const ratio = (val(s.given, "ratio", "") ?? P2! / P1!) as number;
      const db = powerRatioToDb(ratio);
      if (P1 !== undefined) steps.push(`Power ratio = ${n(P2!)} W ÷ ${n(P1)} W = ${n(ratio)}`);
      steps.push(`dB = 10 × log(${n(ratio)})`, `dB = ${n(db)} dB`);
      return { value: db, unit: "", steps };
    }
    const db = need(val(s.given, "db", ""), "db");
    const ratio = 10 ** (db / 10);
    steps.push(`Ratio = 10^(${n(db)} ÷ 10) = ${n(ratio)}`);
    if (find === "ratio")
      return {
        value: ratio,
        unit: "",
        steps: [...steps, "Every 3 dB doubles the power; every 10 dB multiplies it by 10"],
      };
    if (find === "divisor")
      return { value: 1 / ratio, unit: "", steps: [...steps, `Divide the power by ${n(1 / ratio)}`] };
    const P = need(val(s.given, "P", "W"), "P");
    const out = P * ratio;
    steps.push(`P = ${q(P, "W")} × ${n(ratio)} = ${q(out, "W")}`);
    return { value: out, unit: "W", steps };
  },

  /** Four-band resistor colour code: first digit, second digit, multiplier. */
  colour_code: (s) => {
    const bands = s.given.bands;
    if (!Array.isArray(bands) || bands.length < 3)
      throw new Error("colour_code needs bands: [digit, digit, multiplier]");
    const [b1, b2, m] = bands.map(String) as [Colour, Colour, MultiplierColour];
    if (!COLOURS.includes(b1) || !COLOURS.includes(b2) || !MULTIPLIER_COLOURS.includes(m))
      throw new Error(`Unknown colour in ${bands.join(", ")}`);
    const R = colourCodeValue(b1, b2, m);
    const digits = COLOURS.indexOf(b1) * 10 + COLOURS.indexOf(b2);
    return {
      value: R,
      unit: "Ω",
      steps: [
        `${b1} = ${COLOURS.indexOf(b1)}, ${b2} = ${COLOURS.indexOf(b2)}: digits ${digits}`,
        `${m} multiplier = × ${n(multiplierOf(m))}`,
        `${digits} × ${n(multiplierOf(m))} = ${q(R, "Ω")}`,
      ],
    };
  },

  /** Tolerance band: the highest value a resistor may have (the lowest is in the steps). */
  tolerance: (s) => {
    const R = need(val(s.given, "R", "Ω"), "R");
    const tol = need(val(s.given, "tol", ""), "tol");
    const lo = R * (1 - tol / 100);
    const hi = R * (1 + tol / 100);
    return {
      value: hi,
      unit: "Ω",
      steps: [`${n(tol)}% of ${q(R, "Ω")} = ${q((R * tol) / 100, "Ω")}`, `Range: ${q(lo, "Ω")} to ${q(hi, "Ω")}`],
    };
  },

  /** S-meter after a power change: dB over S9 now + 10 log(P2/P1). */
  smeter: (s) => {
    const over = need(val(s.given, "over", ""), "over");
    const P1 = need(val(s.given, "P1", "W"), "P1");
    const P2 = need(val(s.given, "P2", "W"), "P2");
    const change = powerRatioToDb(P2 / P1);
    const now = over + change;
    return {
      value: now,
      unit: "",
      steps: [
        `Power change: 10 × log(${n(P2)} W ÷ ${n(P1)} W) = ${n(change)} dB`,
        `S9 + ${n(over)} dB ${change < 0 ? "−" : "+"} ${n(Math.abs(change))} dB = ${now === 0 ? "S9" : `S9 ${now > 0 ? "+" : "−"} ${n(Math.abs(now))} dB`}`,
      ],
    };
  },

  /** Ideal transformer: Vs/Vp = Ns/Np, Ip×Vp = Is×Vs. find: Vs | Vp | Is | Ip */
  transformer: (s) => {
    const Np = val(s.given, "Np", "");
    const Ns = val(s.given, "Ns", "");
    const Vp = val(s.given, "Vp", "V");
    const Vs = val(s.given, "Vs", "V");
    const steps: string[] = [];
    const Ip = val(s.given, "Ip", "A", steps);
    const Is = val(s.given, "Is", "A", steps);
    const find = need(s.find, "find");
    const ratio =
      Np !== undefined && Ns !== undefined ? Ns / Np : Vs !== undefined && Vp !== undefined ? Vs / Vp : undefined;
    const r = need(ratio, "turns or voltage ratio");
    if (Np !== undefined && Ns !== undefined) steps.push(`Turns ratio Ns:Np = ${n(Ns)}:${n(Np)} = ${n(r)}`);
    else steps.push(`Voltage ratio Vs:Vp = ${n(Vs!)} V : ${n(Vp!)} V = ${n(r)}`);
    if (find === "Vs") {
      const v = need(Vp, "Vp") * r;
      return { value: v, unit: "V", steps: [...steps, `Vs = Vp × ${n(r)} = ${n(Vp!)} V × ${n(r)} = ${q(v, "V")}`] };
    }
    if (find === "Is") {
      const v = need(Ip, "Ip") / r;
      return {
        value: v,
        unit: "A",
        steps: [
          ...steps,
          "Power in = power out, so current changes the other way",
          `Is = Ip ÷ ${n(r)} = ${q(Ip!, "A")} ÷ ${n(r)} = ${q(v, "A")}`,
        ],
      };
    }
    if (find === "Ip") {
      const v = need(Is, "Is") * r;
      return {
        value: v,
        unit: "A",
        steps: [
          ...steps,
          "Power in = power out, so current changes the other way",
          `Ip = Is × ${n(r)} = ${q(Is!, "A")} × ${n(r)} = ${q(v, "A")}`,
        ],
      };
    }
    const v = need(Vs, "Vs") / r;
    return { value: v, unit: "V", steps: [...steps, `Vp = Vs ÷ ${n(r)} = ${q(v, "V")}`] };
  },

  /** AM bandwidth: carrier plus two sidebands, so twice the highest audio frequency. */
  am_bandwidth: (s) => {
    const audio = need(val(s.given, "audio", "Hz"), "audio");
    return {
      value: 2 * audio,
      unit: "Hz",
      steps: [
        "AM has a sideband each side of the carrier, each as wide as the audio",
        `Bandwidth = 2 × ${q(audio, "Hz")} = ${q(2 * audio, "Hz")}`,
      ],
    };
  },

  /** Single-sideband frequency for a single tone: USB = carrier + tone, LSB = carrier − tone. */
  sideband: (s) => {
    const f = need(val(s.given, "f", "Hz"), "f");
    const tone = need(val(s.given, "tone", "Hz"), "tone");
    const lower = String(s.given.sideband ?? "usb").toLowerCase() === "lsb";
    const out = lower ? f - tone : f + tone;
    return {
      value: out,
      unit: "Hz",
      tolerance: 1e-6,
      steps: [
        `${lower ? "Lower" : "Upper"} sideband: the RF is ${lower ? "below" : "above"} the suppressed carrier by the tone frequency`,
        `${q(f, "Hz")} ${lower ? "−" : "+"} ${q(tone, "Hz")} = ${q(out, "Hz")}`,
      ],
    };
  },

  /** Identical batteries: series adds volts (same Ah); parallel adds ampere-hours (same volts). */
  battery_bank: (s) => {
    const V = need(val(s.given, "V", "V"), "V");
    const ah = need(val(s.given, "Ah", ""), "Ah");
    const count = need(val(s.given, "count", ""), "count");
    const series = String(s.given.wiring ?? "series") === "series";
    const bankV = series ? V * count : V;
    const bankAh = series ? ah : ah * count;
    return {
      value: bankV,
      unit: "V",
      also: [{ value: bankAh, unit: "A" }],
      steps: [
        series
          ? "In series the voltages add; the capacity stays the same"
          : "In parallel the capacities add; the voltage stays the same",
        `${n(count)} × ${n(V)} V, ${n(ah)} Ah in ${series ? "series" : "parallel"}: ${n(bankV)} V, ${n(bankAh)} Ah`,
      ],
    };
  },

  /** Smallest wire gauge whose drop over the round trip stays within the limit. */
  wire_gauge: (s) => {
    const len = need(val(s.given, "length", "m"), "length");
    const max = need(val(s.given, "max_drop", "V"), "max_drop");
    const table = s.given.table;
    if (!Array.isArray(table)) throw new Error("wire_gauge needs table: [[gauge, V per metre], ...]");
    const rows = (table as unknown[]).map((r) => (r as number[]).map(Number) as [number, number]);
    const perM = max / (2 * len);
    const ok = rows.filter(([, v]) => v <= perM).sort((a, b) => b[1] - a[1]);
    if (!ok.length) throw new Error("no gauge in the table is heavy enough");
    const [gauge, v] = ok[0]!;
    return {
      value: gauge,
      unit: "",
      steps: [
        `The current goes there and back: ${n(2 * len)} m of wire`,
        `Allowed loss per metre = ${n(max)} V ÷ ${n(2 * len)} m = ${n(perM)} V/m`,
        `The thinnest wire that loses no more than that: number ${gauge} (${n(v)} V/m, ${n(v * 2 * len)} V in total)`,
      ],
    };
  },

  /** Matched line loss in dB is proportional to length: percentage change from one length to another. */
  line_loss_change: (s) => {
    const a = need(val(s.given, "from", "m"), "from");
    const b = need(val(s.given, "to", "m"), "to");
    const pct = (b / a - 1) * 100;
    return {
      value: pct,
      unit: "",
      steps: [
        "Loss in dB is proportional to length",
        `${n(b)} m ÷ ${n(a)} m = ${n(b / a)} times the loss`,
        `An increase of ${n(pct)}%`,
      ],
    };
  },

  /** Impedance transformation ratio between two impedances. */
  impedance_ratio: (s) => {
    const a = need(val(s.given, "from", "Ω"), "from");
    const b = need(val(s.given, "to", "Ω"), "to");
    const r = Math.max(a, b) / Math.min(a, b);
    return { value: r, unit: "", steps: [`Ratio = ${q(Math.max(a, b), "Ω")} ÷ ${q(Math.min(a, b), "Ω")} = ${n(r)}:1`] };
  },

  /** Gain over a dipole = gain over isotropic − 2.15 dB (rounded to 2.1 in the exam). */
  dbi_to_dbd: (s) => {
    const dbi = need(val(s.given, "dbi", ""), "dbi");
    const dbd = dbi - 2.1;
    return {
      value: dbd,
      unit: "",
      steps: ["A dipole has about 2.1 dB of gain over isotropic", `${n(dbi)} dBi − 2.1 dB = ${n(dbd)} dBd`],
    };
  },

  /** Stacking identical antennas: each doubling adds 3 dB. */
  stack_gain: (s) => {
    const g = need(val(s.given, "gain", ""), "gain");
    const count = need(val(s.given, "count", ""), "count");
    const total = g + 10 * Math.log10(count);
    return {
      value: total,
      unit: "",
      steps: [
        `${n(count)} antennas: 10 × log(${n(count)}) = ${n(10 * Math.log10(count))} dB more`,
        `${n(g)} + ${n(10 * Math.log10(count))} ≈ ${n(total)} dBi`,
      ],
    };
  },

  /** Edges of an amateur band in Canada (RBR-4), by its name in metres. */
  band_edges: (s) => {
    const m = need(val(s.given, "band", ""), "band");
    const b = bandByMetres(m);
    if (!b) throw new Error(`No ${m} m band`);
    return {
      value: b.lo * 1e6,
      unit: "Hz",
      also: [{ value: b.hi * 1e6, unit: "Hz" }],
      tolerance: 1e-4,
      steps: [`The ${b.name} band runs from ${b.lo} MHz to ${b.hi} MHz`],
    };
  },

  /** Maximum bandwidth (RBR-4) in the band containing a frequency. */
  bandwidth_limit: (s) => {
    const f = need(val(s.given, "f", "Hz"), "f") / 1e6;
    const b = bandAt(f);
    if (!b) throw new Error(`${f} MHz isn't in an amateur band`);
    return {
      value: b.bwKHz * 1000,
      unit: "Hz",
      steps: [`${n(f)} MHz is in the ${b.name} band`, `Its maximum bandwidth is ${b.bwKHz} kHz`],
    };
  },

  /** Power limits (RBR-4) by qualification and how the power is measured. */
  power_limit: (s) => {
    const q = String(s.given.qualification) as Qualification;
    const m = String(s.given.measure) as PowerMeasure;
    const table = POWER_LIMITS[q];
    if (!table || !(m in table)) throw new Error("power_limit needs qualification and measure");
    const w = table[m];
    return {
      value: w,
      unit: "W",
      steps: [
        `${MEASURE_NAMES[m]}, ${q === "advanced" ? "Advanced" : q === "honours" ? "Basic with Honours" : "Basic"} qualification: ${w} W`,
      ],
    };
  },

  /** Superheterodyne local oscillator: LO = f + IF (LO above) or f − IF (LO below). */
  superhet: (s) => {
    const f = need(val(s.given, "f", "Hz"), "f");
    const ifq = need(val(s.given, "if", "Hz"), "if");
    const above = String(s.given.lo ?? "above") !== "below";
    const lo = above ? f + ifq : f - ifq;
    return {
      value: lo,
      unit: "Hz",
      steps: [
        `The mixer makes the IF from the difference: |LO − f| = IF`,
        `LO ${above ? "above" : "below"} the signal: LO = ${q(f, "Hz")} ${above ? "+" : "−"} ${q(ifq, "Hz")}`,
        `LO = ${q(lo, "Hz")}`,
      ],
    };
  },

  /** λ (m) = 300 ÷ f (MHz), and the reverse. */
  wavelength: (s) => {
    const f = val(s.given, "f", "Hz");
    if (f !== undefined) {
      const mhz = f / 1e6;
      const l = 300 / mhz;
      return { value: l, unit: "m", steps: ["λ (metres) = 300 ÷ f (MHz)", `λ = 300 ÷ ${n(mhz)}`, `λ = ${n(l)} m`] };
    }
    const l = need(val(s.given, "wavelength", "m"), "f or wavelength");
    const mhz = 300 / l;
    return {
      value: mhz * 1e6,
      unit: "Hz",
      steps: ["f (MHz) = 300 ÷ λ (metres)", `f = 300 ÷ ${n(l)}`, `f = ${n(mhz)} MHz`],
    };
  },

  /** Antenna element lengths from the exam's rules of thumb: k ÷ f (MHz). */
  antenna: (s) => {
    const f = need(val(s.given, "f", "Hz"), "f");
    const k = need(val(s.given, "k", ""), "k");
    const mhz = f / 1e6;
    const l = k / mhz;
    const name = typeof s.given.element === "string" ? s.given.element : "length";
    return {
      value: l,
      unit: "m",
      // Lengths are quoted to 3 or 4 figures, and 300 ÷ f sits within 2% of 306 ÷ f.
      tolerance: 0.005,
      steps: [`${name} (metres) ≈ ${n(k)} ÷ f (MHz)`, `= ${n(k)} ÷ ${n(mhz)}`, `= ${n(l)} m`],
    };
  },

  reactance: (s) => {
    const f = need(val(s.given, "f", "Hz"), "f");
    const L = val(s.given, "L", "H");
    if (L !== undefined) {
      const x = inductiveReactance(f, L);
      return {
        value: x,
        unit: "Ω",
        steps: ["XL = 2πfL", `XL = 2π × ${q(f, "Hz")} × ${q(L, "H")}`, `XL = ${q(x, "Ω")}`],
      };
    }
    const C = need(val(s.given, "C", "F"), "L or C");
    const x = capacitiveReactance(f, C);
    return {
      value: x,
      unit: "Ω",
      steps: ["XC = 1 ÷ (2πfC)", `XC = 1 ÷ (2π × ${q(f, "Hz")} × ${q(C, "F")})`, `XC = ${q(x, "Ω")}`],
    };
  },

  resonance: (s) => {
    const L = need(val(s.given, "L", "H"), "L");
    const C = need(val(s.given, "C", "F"), "C");
    const f = resonantFrequency(L, C);
    return {
      value: f,
      unit: "Hz",
      steps: ["f = 1 ÷ (2π√(LC))", `f = 1 ÷ (2π√(${q(L, "H")} × ${q(C, "F")}))`, `f = ${q(f, "Hz")}`],
    };
  },
};

export const CALCULATORS = Object.keys(calculators);

export function runCalculation(spec: CalcSpec): CalcResult {
  const c = calculators[spec.calc];
  if (!c) throw new Error(`Unknown calculator '${spec.calc}'`);
  return c(spec);
}

/**
 * Every number in an exam answer, as values in base units where a unit follows it
 * ("3 525 kHz" → 3 525 000) and as the bare number too ("Multiply by 4" → 4).
 */
export function answerNumbers(answer: string, unit?: Unit | ""): number[] {
  const out: number[] = [];
  const re = /(?<![\w.])(\d{1,3}(?:[ \u202f]\d{3})+|\d+)(?:[.,](\d+))?(?:\s*([A-Za-zµμΩ]+))?/g;
  for (const m of answer.matchAll(re)) {
    const numText = m[0].replace(/\s*[A-Za-zµμΩ]+$/, "");
    const bare = Number(numText.replace(/[ \u202f]/g, "").replace(",", "."));
    const parsed = m[3] ? parseQuantity(`${numText} ${m[3]}`, unit ? (unit as Unit) : undefined) : null;
    if (parsed) {
      // "0.25 mA" is 0.00025 A, never 0.25 of anything; a mismatched unit can't match at all.
      if (!unit || !parsed.unit || parsed.unit === unit) out.push(parsed.value);
    } else if (Number.isFinite(bare)) out.push(bare);
  }
  return out;
}

/** True when the answer contains the result's value and every `also` value. */
export function resultMatches(answer: string, r: Pick<CalcResult, "value" | "unit" | "also" | "tolerance">): boolean {
  const tol = r.tolerance ?? 0.02;
  return (
    answerMatches(answer, r.value, r.unit, tol) &&
    (r.also ?? []).every((a) => answerMatches(answer, a.value, a.unit, tol))
  );
}

/** True when some number in `answer` matches `value` within `tolerance` (relative). */
export function answerMatches(answer: string, value: number, unit?: Unit | "", tolerance = 0.02): boolean {
  return answerNumbers(answer, unit).some(
    (x) => Math.abs(x - value) <= tolerance * Math.max(Math.abs(x), Math.abs(value), 1e-12),
  );
}
