/**
 * Section 4 models: LAB-17 Component Bench (diode, Zener, BJT, FET, triode, amplifier, rectifier)
 * and LAB-18 Resistor Colour Code. Teaching-grade device curves, not SPICE models: the shapes and
 * the directions of change are what the exam asks about.
 */
import type { Vars } from "./goal.ts";

// ---- LAB-18 Resistor colour code ------------------------------------------------------------

export const COLOURS = [
  "black",
  "brown",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "violet",
  "grey",
  "white",
] as const;
export type Colour = (typeof COLOURS)[number];
export const MULTIPLIER_COLOURS = [...COLOURS, "gold", "silver"] as const;
export type MultiplierColour = (typeof MULTIPLIER_COLOURS)[number];
export const TOLERANCE_COLOURS = ["brown", "red", "gold", "silver", "none"] as const;
export type ToleranceColour = (typeof TOLERANCE_COLOURS)[number];
export const TOLERANCE_PERCENT: Record<ToleranceColour, number> = { brown: 1, red: 2, gold: 5, silver: 10, none: 20 };

export function multiplierOf(c: MultiplierColour): number {
  if (c === "gold") return 0.1;
  if (c === "silver") return 0.01;
  return 10 ** COLOURS.indexOf(c as Colour);
}

/** Value in ohms of a four-band resistor: two digits, a multiplier, a tolerance. */
export function colourCodeValue(b1: Colour, b2: Colour, mult: MultiplierColour): number {
  return (COLOURS.indexOf(b1) * 10 + COLOURS.indexOf(b2)) * multiplierOf(mult);
}

export interface ColourCodeState {
  bands: [Colour, Colour, MultiplierColour, ToleranceColour];
  /** Speed-round score (client-side game). */
  score?: number;
}

export function colourCodeVariables(s: ColourCodeState): Vars | null {
  const [b1, b2, m, t] = s.bands ?? [];
  if (!COLOURS.includes(b1 as Colour) || !COLOURS.includes(b2 as Colour)) return null;
  if (!MULTIPLIER_COLOURS.includes(m as MultiplierColour) || !TOLERANCE_COLOURS.includes(t as ToleranceColour))
    return null;
  const R = colourCodeValue(b1 as Colour, b2 as Colour, m as MultiplierColour);
  const tol = TOLERANCE_PERCENT[t as ToleranceColour];
  return {
    R,
    tol,
    min: R * (1 - tol / 100),
    max: R * (1 + tol / 100),
    score: typeof s.score === "number" ? s.score : 0,
  };
}

// ---- LAB-17 Component Bench -----------------------------------------------------------------

export type Device = "diode" | "zener" | "bjt" | "fet" | "triode";
export const DIODE_DROP = 0.6;
export const ZENER_VOLTS = 5.1;
export const BJT_BETA = 100;
const VCC = 12;
const RC = 1000;
const FET_IDSS = 0.01;
const FET_VP = -4;

/** Diode/Zener current (A) for a voltage across it (V; positive = forward bias), through 100 Ω. */
export function diodeCurrent(v: number, zener = false): number {
  if (v > DIODE_DROP) return (v - DIODE_DROP) / 100;
  if (zener && v < -ZENER_VOLTS) return (v + ZENER_VOLTS) / 100; // negative: reverse breakdown current
  return 0;
}

/** BJT collector current (A) for a base current (A), common emitter with 12 V and 1 kΩ: saturates at 12 mA. */
export function bjtCollectorCurrent(ib: number): number {
  return Math.min(BJT_BETA * Math.max(0, ib), VCC / RC);
}

/** JFET drain current (A) for a gate-source voltage (V, 0 down to −4 V reverse bias). */
export function fetDrainCurrent(vgs: number): number {
  if (vgs <= FET_VP) return 0;
  const g = Math.min(0, vgs);
  return FET_IDSS * (1 - g / FET_VP) ** 2;
}

/** Triode plate current (A) for a grid voltage (V, 0 down to −8 V). */
export function triodePlateCurrent(vg: number): number {
  const x = Math.max(0, Math.min(1, (vg + 8) / 8));
  return 0.02 * x ** 1.5;
}

export interface BenchState {
  device: Device;
  mode: "iv" | "amp" | "rectifier";
  /** Device input: diode volts, BJT base current in A, FET Vgs, triode grid volts. */
  input: number;
  /** Amplifier mode: input signal peak (V). */
  drive?: number;
}

export const AMP_GAIN = 10;
export const AMP_CLIP = 10;

export function benchVariables(s: BenchState): Vars | null {
  if (!["diode", "zener", "bjt", "fet", "triode"].includes(s.device) || !["iv", "amp", "rectifier"].includes(s.mode))
    return null;
  if (typeof s.input !== "number" || !Number.isFinite(s.input)) return null;
  const drive = typeof s.drive === "number" && Number.isFinite(s.drive) ? Math.max(0, s.drive) : 0;
  let current = 0;
  switch (s.device) {
    case "diode":
    case "zener":
      current = diodeCurrent(s.input, s.device === "zener");
      break;
    case "bjt":
      current = bjtCollectorCurrent(s.input);
      break;
    case "fet":
      current = fetDrainCurrent(s.input);
      break;
    case "triode":
      current = triodePlateCurrent(s.input);
      break;
  }
  const outputPeak = Math.min(AMP_GAIN * drive, AMP_CLIP);
  return {
    current: Math.abs(current),
    forward: s.input > 0,
    conducting: Math.abs(current) > 0.001,
    regulating: s.device === "zener" && s.input < -ZENER_VOLTS,
    saturated: s.device === "bjt" && BJT_BETA * s.input >= VCC / RC,
    cutoff: (s.device === "bjt" && s.input <= 0) || (s.device === "fet" && s.input <= FET_VP),
    reverseBias: s.device === "fet" ? -s.input : 0,
    gain: s.mode === "amp" ? AMP_GAIN : s.device === "bjt" ? BJT_BETA : 0,
    drive,
    outputPeak,
    distorted: s.mode === "amp" && AMP_GAIN * drive > AMP_CLIP,
    rectified: s.mode === "rectifier",
  };
}
