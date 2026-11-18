// Section 3 station labs: SSB drive and ALC (LAB-04), keyers (LAB-10), the Power Bench (LAB-15),
// the Safe Shack Inspector (LAB-16) and RF exposure (LAB-05).
import type { Vars } from "./goal.ts";
import { MORSE } from "./morse.ts";

const finite = (...xs: unknown[]) => xs.every((x) => typeof x === "number" && Number.isFinite(x));

// ---- LAB-04 SSB drive: microphone gain, speech processing, ALC, PEP ----------------------------

export interface SsbDriveConfig {
  /** Transmitter's rated PEP output, W. */
  rated: number;
}
export interface SsbDriveState {
  /** Microphone gain, 0..1 (knob position). */
  mic: number;
  /** Speech processor: 0 off, 1 moderate, 2 heavy. */
  processor: 0 | 1 | 2;
}

/** Peak-to-average power ratio of speech with no processing, moderate and heavy processing. */
const AVERAGE_FRACTION = [0.2, 0.4, 0.55];

export function ssbDriveVariables(s: SsbDriveState, c: SsbDriveConfig): Vars | null {
  if (!finite(s?.mic, c?.rated) || ![0, 1, 2].includes(s.processor)) return null;
  // Drive relative to the point where ALC starts to act; the ALC meter's range ends at 1.5.
  const drive = s.mic * 2;
  const alc = Math.max(0, drive - 1) * 3; // 0 = idle, 1.5 = top of the ALC range
  const pep = c.rated * Math.min(1, drive);
  const overdriven = alc > 1.5;
  const distorted = overdriven || s.processor === 2;
  return {
    drive,
    alc,
    alcOver: overdriven,
    pep,
    avg: pep * AVERAGE_FRACTION[s.processor]!,
    processor: s.processor,
    distorted,
    splatter: distorted,
    bandwidth: distorted ? 6000 : 2400,
  };
}

// ---- LAB-10 Morse keyer ------------------------------------------------------------------------

export interface KeyerConfig {
  /** The character(s) the learner must send. */
  target: string;
}
export interface KeyerState {
  /** Electronic keyer (true) or straight key (false). */
  keyer: boolean;
  /** What was sent, as dits and dahs with spaces between characters. */
  sent: string;
  /** Straight key only: each element's duration as a multiple of a dit (ideal 1 or 3). */
  durations?: number[];
}

/** Worst timing error (fraction of the ideal length) over the elements sent with a straight key. */
export function timingError(sent: string, durations: number[] = []): number {
  const elements = sent.replace(/\s/g, "").split("");
  let worst = 0;
  elements.forEach((e, i) => {
    const d = durations[i];
    if (typeof d !== "number") return;
    const ideal = e === "." ? 1 : 3;
    worst = Math.max(worst, Math.abs(d - ideal) / ideal);
  });
  return worst;
}

export function keyerVariables(s: KeyerState, c: KeyerConfig): Vars | null {
  if (typeof s?.sent !== "string" || typeof c?.target !== "string") return null;
  const want = c.target
    .toUpperCase()
    .split("")
    .map((ch) => MORSE[ch] ?? "")
    .join(" ");
  const sent = s.sent.trim().replace(/\s+/g, " ");
  const error = s.keyer ? 0 : timingError(sent, s.durations);
  return {
    keyer: Boolean(s.keyer),
    elements: sent.replace(/\s/g, "").length,
    correct: sent === want,
    timingError: error,
    clean: sent === want && error <= 0.25,
  };
}

// ---- LAB-15 Power Bench: batteries, wiring, fuses, supplies -----------------------------------

export interface PowerBenchState {
  /** Battery bank: number of identical batteries and how they're wired. */
  batteries: number;
  wiring: "series" | "parallel";
  /** Load current, A. */
  load: number;
  /** DC wire gauge (AWG) and one-way run, m. */
  gauge: 8 | 10 | 12 | 14;
  length: number;
  fuse: "battery" | "radio" | "none";
  supply: "battery" | "linear" | "switching" | "unregulated";
}
export interface PowerBenchConfig {
  /** Per battery: volts, ampere-hours, internal resistance (Ω). */
  cellV: number;
  cellAh: number;
  cellR: number;
}

/** Volts lost per metre of wire at 22 A, by gauge (from the exam's table), scaled to other currents. */
export const WIRE_V_PER_M_AT_22A: Record<number, number> = { 14: 0.19, 12: 0.11, 10: 0.07, 8: 0.05 };

export function wireDrop(gauge: number, oneWayMetres: number, amps: number): number {
  const perM = WIRE_V_PER_M_AT_22A[gauge];
  if (perM === undefined) return NaN;
  return (perM / 22) * amps * oneWayMetres * 2; // there and back
}

export function powerBenchVariables(s: PowerBenchState, c: PowerBenchConfig): Vars | null {
  if (!finite(s?.batteries, s?.load, s?.length, c?.cellV, c?.cellAh, c?.cellR) || s.batteries < 1) return null;
  if (!["series", "parallel"].includes(s.wiring) || !(s.gauge in WIRE_V_PER_M_AT_22A)) return null;
  const n = Math.round(s.batteries);
  const series = s.wiring === "series" && n > 1;
  const V = series ? c.cellV * n : c.cellV;
  const Ah = series ? c.cellAh : c.cellAh * n;
  const R = series ? c.cellR * n : c.cellR / n;
  const sag = s.load * R;
  const drop = wireDrop(s.gauge, s.length, s.load);
  const regulated = s.supply === "linear" || s.supply === "switching";
  const source = s.supply === "battery" ? V - sag : 13.8;
  return {
    V,
    Ah,
    sag,
    terminal: V - sag,
    drop,
    atRadio: source - drop,
    hours: s.load > 0 ? Ah / s.load : Infinity,
    protected: s.fuse === "battery",
    fused: s.fuse !== "none",
    rfNoise: s.supply === "switching",
    regulated,
    chirp: s.supply === "unregulated",
  };
}

// ---- LAB-16 Safe Shack Inspector -------------------------------------------------------------

export interface InspectorItem {
  id: string;
  label: string;
  hazard: boolean;
  why: string;
}
export interface InspectorConfig {
  items: InspectorItem[];
}
export interface InspectorState {
  /** id → the learner's verdict. */
  verdicts: Record<string, "hazard" | "safe">;
}

export function inspectorVariables(s: InspectorState, c: InspectorConfig): Vars | null {
  if (!c || !Array.isArray(c.items)) return null;
  const v = s?.verdicts ?? {};
  let correct = 0;
  let wrong = 0;
  let hazardsFound = 0;
  for (const it of c.items) {
    const got = v[it.id];
    if (!got) continue;
    if ((got === "hazard") === it.hazard) {
      correct++;
      if (it.hazard) hazardsFound++;
    } else wrong++;
  }
  const hazards = c.items.filter((i) => i.hazard).length;
  return { correct, wrong, total: c.items.length, hazards, hazardsFound, complete: correct === c.items.length };
}

// ---- LAB-05 RF exposure ----------------------------------------------------------------------

export interface RfExposureConfig {
  /** Transmitter power, W, and antenna gain over isotropic, dBi. */
  power: number;
  gainDbi: number;
  /** Exposure limit for this example, W/m². */
  limit: number;
}
export interface RfExposureState {
  /** Distance from the antenna, m. */
  distance: number;
}

/** Far-field power density (W/m²) at distance d from an antenna radiating P watts with gain G (dBi). */
export function powerDensity(P: number, gainDbi: number, d: number): number {
  return (P * 10 ** (gainDbi / 10)) / (4 * Math.PI * d * d);
}

/** Distance at which the power density falls to `limit`. */
export function safeDistance(P: number, gainDbi: number, limit: number): number {
  return Math.sqrt((P * 10 ** (gainDbi / 10)) / (4 * Math.PI * limit));
}

export function rfExposureVariables(s: RfExposureState, c: RfExposureConfig): Vars | null {
  if (!finite(s?.distance, c?.power, c?.gainDbi, c?.limit) || s.distance <= 0) return null;
  const S = powerDensity(c.power, c.gainDbi, s.distance);
  return {
    S,
    d: s.distance,
    limit: c.limit,
    ratio: S / c.limit,
    safe: S <= c.limit,
    safeDistance: safeDistance(c.power, c.gainDbi, c.limit),
  };
}

// ---- Safety Code 6 reference levels (power density) -------------------------------------------

/**
 * Health Canada Safety Code 6 (2015) power-density reference levels, W/m², for the uncontrolled
 * (general public) environment; the controlled environment is five times higher here. Below
 * 10 MHz SC6 gives field-strength limits only, so the 10 MHz value is held. To be checked against
 * the current Safety Code 6 by a licensed reviewer.
 */
export function sc6Limit(fMHz: number, environment: "uncontrolled" | "controlled" = "uncontrolled"): number {
  let s: number;
  if (fMHz <= 20) s = 2;
  else if (fMHz < 48) s = 8.944 / Math.sqrt(fMHz);
  else if (fMHz <= 300) s = 1.291;
  else if (fMHz <= 6000) s = 0.02619 * fMHz ** 0.6834;
  else s = 10;
  return environment === "controlled" ? s * 5 : s;
}

export interface Sc6State {
  f: number;
  environment: "uncontrolled" | "controlled";
}

export function sc6Variables(s: Sc6State): Vars | null {
  if (!finite(s?.f) || s.f <= 0) return null;
  const limit = sc6Limit(s.f, s.environment);
  return {
    f: s.f,
    limit,
    lowest: s.environment !== "controlled" && s.f >= 48 && s.f <= 300,
    controlled: s.environment === "controlled",
  };
}
