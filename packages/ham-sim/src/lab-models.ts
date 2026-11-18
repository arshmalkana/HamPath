/**
 * Models for the section-5 labs (LAB-19, LAB-21..LAB-25, LAB-20's L/C combiner). Each turns a lab's
 * state (plus its step config) into goal variables. The browser evaluates goals live; the API
 * recomputes the same variables from the reported state before accepting goal_met.
 */
import type { Vars } from "./goal.ts";
import { parallelResistance, seriesResistance } from "./resistors.ts";
import { parseQuantity } from "./units.ts";
import { capacitiveReactance, inductiveReactance, powerRatioToDb, resonantFrequency } from "./wave.ts";

const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const pos = (x: unknown): x is number => num(x) && x > 0;

// ---- LAB-19 Unit Slider -------------------------------------------------------------------

export const PREFIX_EXPONENTS = [-12, -9, -6, -3, 0, 3, 6, 9] as const;

export interface UnitSliderState {
  exp: number;
}

/** The step's quantity (e.g. "3.525 MHz") shown with the chosen prefix exponent. */
export function unitSliderVariables(state: UnitSliderState, config: { quantity?: string; unit?: string }): Vars | null {
  if (!PREFIX_EXPONENTS.includes(state.exp as never)) return null;
  const q = parseQuantity(String(config.quantity ?? ""), config.unit as never);
  if (!q) return null;
  return { exp: state.exp, base: q.value, mantissa: q.value / 10 ** state.exp };
}

// ---- LAB-20 combiner: R, L or C in series/parallel -----------------------------------------

export interface CombineState {
  kind: "R" | "L" | "C";
  arrangement: "series" | "parallel";
  values: number[];
}

/** Total of 2–4 parts. Capacitors combine the opposite way from resistors and inductors. */
export function combineTotal(s: CombineState): number {
  const additive = (s.kind === "C") === (s.arrangement === "parallel");
  return additive ? seriesResistance(s.values) : parallelResistance(s.values);
}

export function combineVariables(s: CombineState): Vars | null {
  if (!["R", "L", "C"].includes(s.kind) || !["series", "parallel"].includes(s.arrangement)) return null;
  if (!Array.isArray(s.values) || s.values.length < 1 || s.values.length > 4 || !s.values.every(pos)) return null;
  const total = combineTotal(s);
  return { total, count: s.values.length, ratio: total / s.values[0]!, series: s.arrangement === "series" };
}

// ---- LAB-21 AC Scope ------------------------------------------------------------------------

export interface ScopeState {
  /** Hz */
  f: number;
  harmonic: boolean;
  /** Phase of the second trace, degrees. */
  phase: number;
  /** For reactance mode: henries / farads (0 = not shown). */
  L?: number;
  C?: number;
}

export function scopeVariables(s: ScopeState): Vars | null {
  if (!pos(s.f) || typeof s.harmonic !== "boolean" || !num(s.phase)) return null;
  const L = pos(s.L) ? s.L : 0;
  const C = pos(s.C) ? s.C : 0;
  return {
    f: s.f,
    T: 1 / s.f,
    wavelength: 300e6 / s.f,
    harmonic: s.harmonic,
    phase: ((s.phase % 360) + 360) % 360,
    XL: L ? inductiveReactance(s.f, L) : 0,
    XC: C ? capacitiveReactance(s.f, C) : 0,
    audio: s.f >= 20 && s.f <= 20_000,
    hf: s.f >= 3e6 && s.f < 30e6,
  };
}

/** Radio-frequency band name for a frequency (ITU band designations). */
export function bandName(f: number): string {
  const bands: [number, string][] = [
    [3e3, "below VLF"],
    [30e3, "VLF"],
    [300e3, "LF"],
    [3e6, "MF"],
    [30e6, "HF"],
    [300e6, "VHF"],
    [3e9, "UHF"],
    [30e9, "SHF"],
  ];
  return bands.find(([top]) => f < top)?.[1] ?? "EHF";
}

// ---- LAB-22 dB Ladder -----------------------------------------------------------------------

export interface DbLadderState {
  /** Starting power, watts. */
  P0: number;
  /** Each stage's gain (positive) or loss (negative), dB. */
  stages: number[];
}

export function dbLadderVariables(s: DbLadderState): Vars | null {
  if (!pos(s.P0) || !Array.isArray(s.stages) || s.stages.length > 6 || !s.stages.every(num)) return null;
  const db = s.stages.reduce((a, b) => a + b, 0);
  const ratio = 10 ** (db / 10);
  return { P0: s.P0, db, ratio, Pout: s.P0 * ratio };
}

export const dbBetween = (p1: number, p2: number) => powerRatioToDb(p2 / p1);

// ---- LAB-23 Transformer Lab -----------------------------------------------------------------

export interface TransformerState {
  Np: number;
  Ns: number;
  /** Primary volts (AC). */
  Vp: number;
  /** Load on the secondary, ohms. */
  Rload: number;
}

export function transformerVariables(s: TransformerState): Vars | null {
  if (![s.Np, s.Ns, s.Vp, s.Rload].every(pos)) return null;
  const ratio = s.Ns / s.Np;
  const Vs = s.Vp * ratio;
  const Is = Vs / s.Rload;
  const Ip = Is * ratio;
  return { ratio, Vs, Is, Ip, Pout: Vs * Is, Pin: s.Vp * Ip, Zp: s.Rload / (ratio * ratio), stepUp: ratio > 1 };
}

// ---- LAB-24 Resonance Tuner -----------------------------------------------------------------

export interface ResonanceState {
  /** henries */
  L: number;
  /** farads */
  C: number;
  /** series resistance, ohms */
  R: number;
  circuit: "series" | "parallel";
  /** test frequency, Hz */
  f: number;
}

/** Impedance magnitude of a series or parallel RLC at frequency f. */
export function rlcImpedance(s: ResonanceState, f = s.f): number {
  const XL = inductiveReactance(f, s.L);
  const XC = capacitiveReactance(f, s.C);
  if (s.circuit === "series") return Math.hypot(s.R, XL - XC);
  // Parallel tank: coil (L with series loss R) in parallel with C.
  const zl = { re: s.R, im: XL };
  const zc = { re: 0, im: -XC };
  const num = { re: zl.re * zc.re - zl.im * zc.im, im: zl.re * zc.im + zl.im * zc.re };
  const den = { re: zl.re + zc.re, im: zl.im + zc.im };
  return Math.hypot(num.re, num.im) / Math.hypot(den.re, den.im);
}

export function resonanceVariables(s: ResonanceState): Vars | null {
  if (![s.L, s.C, s.f].every(pos) || !num(s.R) || s.R < 0 || !["series", "parallel"].includes(s.circuit)) return null;
  const f0 = resonantFrequency(s.L, s.C);
  const XL = inductiveReactance(s.f, s.L);
  const XC = capacitiveReactance(s.f, s.C);
  const Q = s.R > 0 ? inductiveReactance(f0, s.L) / s.R : 1000;
  return {
    f0,
    f: s.f,
    XL,
    XC,
    Z: rlcImpedance(s),
    Q,
    bandwidth: f0 / Q,
    atResonance: Math.abs(s.f - f0) / f0 < 0.01,
    parallel: s.circuit === "parallel",
  };
}

// ---- LAB-25 Meter Lab: see labs.ts (it reuses the LAB-20 breadboard) -----------------------
