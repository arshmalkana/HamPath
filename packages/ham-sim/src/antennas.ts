// LAB-28 Antenna Builder: Yagi, dipole, vertical and loop modes.
//
// Lengths use the exam's rules of thumb: half-wave dipole ≈ 143 ÷ f, quarter-wave vertical
// ≈ 71.3 ÷ f, full-wave loop ≈ 306 ÷ f (metres, f in MHz). The Yagi gain and front-to-back
// figures are a teaching model (typical values), not a NEC simulation.
import type { Vars } from "./goal.ts";

const finite = (...xs: unknown[]) => xs.every((x) => typeof x === "number" && Number.isFinite(x));

/** Rule-of-thumb constants: length (m) = K ÷ f (MHz). */
export const DIPOLE_K = 143;
export const QUARTER_K = 71.3;
export const LOOP_K = 306;
/** Within this fraction of the operating frequency counts as resonant. */
export const RESONANT_WITHIN = 0.01;

// ---- Yagi ------------------------------------------------------------------------------------

export type YagiElement = "reflector" | "driven" | "director";

export interface YagiState {
  mode: "yagi";
  /** Element lengths as a fraction of the driven element's resonant half-wave (1 = resonant). */
  reflector: number;
  driven: number;
  director: number;
  /** Which element the feedline is connected to. */
  feed: YagiElement | null;
  /** Number of directors (default 1) and element spacing in wavelengths (default 0.2). */
  directors?: number;
  spacing?: number;
}

const REFLECTS = 1.02;
const DIRECTS = 0.98;

export interface YagiModel {
  reflecting: boolean;
  directing: boolean;
  /** Forward gain over a dipole, dB. */
  gain: number;
  /** Front-to-back ratio, dB. */
  fb: number;
}

export function yagiModel(
  s: Pick<YagiState, "reflector" | "driven" | "director" | "directors" | "spacing">,
): YagiModel {
  const reflecting = s.reflector >= s.driven * REFLECTS;
  const directing = s.director <= s.driven * DIRECTS;
  const directors = directing ? Math.max(1, Math.round(s.directors ?? 1)) : 0;
  const spacing = s.spacing ?? 0.2;
  let gain = (reflecting ? 3 : 0) + (directing ? 2.5 : 0) + (reflecting && directing ? 0.5 : 0);
  // More directors on a longer boom add gain; wider spacing adds a little more.
  gain += Math.max(0, directors - 1) * 1.4;
  if (reflecting || directing) gain += Math.max(-1.5, Math.min(1, 5 * (spacing - 0.2)));
  let fb = reflecting && directing ? 20 : reflecting || directing ? 8 : 0;
  // Front-to-back is best around 0.2 λ spacing.
  if (fb > 0) fb = Math.max(4, fb - 30 * Math.abs(spacing - 0.2));
  return { reflecting, directing, gain: Number(gain.toFixed(1)), fb: Number(fb.toFixed(1)) };
}

/** Relative field strength (0..1) at bearing θ (radians, 0 = toward the director). */
export function yagiPattern(m: YagiModel, theta: number): number {
  const back = 10 ** (-m.fb / 20);
  const cardioid = (1 + back + (1 - back) * Math.cos(theta)) / 2;
  return cardioid ** (1 + m.gain / 4);
}

export function yagiVariables(s: YagiState): Vars | null {
  const lengths = [s?.reflector, s?.driven, s?.director];
  if (!lengths.every((x) => typeof x === "number" && Number.isFinite(x) && x > 0)) return null;
  const m = yagiModel(s);
  const longest = Math.max(...lengths);
  const shortest = Math.min(...lengths);
  return {
    reflecting: m.reflecting,
    directing: m.directing,
    gain: m.gain,
    fb: m.fb,
    reflectorLongest: s.reflector === longest && s.reflector > s.driven && s.reflector > s.director,
    directorShortest: s.director === shortest && s.director < s.driven && s.director < s.reflector,
    fedDriven: s.feed === "driven",
    fed: s.feed !== null && s.feed !== undefined,
    directors: Math.round(s.directors ?? 1),
    spacing: s.spacing ?? 0.2,
  };
}

// ---- Dipole ------------------------------------------------------------------------------------

export interface DipoleState {
  mode: "dipole";
  /** Operating frequency (MHz) and total length (m). */
  f: number;
  length: number;
  /** Which way the wire's ends point. */
  orientation: "ns" | "ew";
}

export function dipoleVariables(s: DipoleState): Vars | null {
  if (!finite(s?.f, s?.length) || s.f <= 0 || s.length <= 0) return null;
  const f0 = DIPOLE_K / s.length;
  return {
    f0,
    resonant: Math.abs(f0 - s.f) / s.f <= RESONANT_WITHIN,
    tooLong: f0 < s.f * (1 - RESONANT_WITHIN),
    tooShort: f0 > s.f * (1 + RESONANT_WITHIN),
    // A dipole radiates broadside: ends north-south means east and west.
    beamEW: s.orientation === "ns",
    beamNS: s.orientation === "ew",
  };
}

// ---- Vertical ----------------------------------------------------------------------------------

export interface VerticalConfig {
  /** Short mobile whip: its capacitive reactance (Ω) at the operating frequency, tuned by a coil. */
  whipReactance?: number;
}
export interface VerticalState {
  mode: "vertical";
  f: number;
  length: number;
  radials: "none" | "horizontal" | "drooping";
  /** Loading coil, µH (short whips). */
  coil?: number;
}

export const RADIAL_FEED_Z = { none: 0, horizontal: 36, drooping: 50 } as const;

export function verticalVariables(s: VerticalState, c: VerticalConfig = {}): Vars | null {
  if (!finite(s?.f, s?.length) || s.f <= 0 || s.length <= 0 || !(s.radials in RADIAL_FEED_Z)) return null;
  const feedZ = RADIAL_FEED_Z[s.radials];
  let f0 = QUARTER_K / s.length;
  let resonant = Math.abs(f0 - s.f) / s.f <= RESONANT_WITHIN;
  let coilReactance = 0;
  if (c.whipReactance) {
    coilReactance = 2 * Math.PI * s.f * 1e6 * (s.coil ?? 0) * 1e-6;
    resonant = Math.abs(coilReactance - c.whipReactance) / c.whipReactance <= 0.02;
    f0 = resonant ? s.f : f0;
  }
  return {
    f0,
    resonant,
    feedZ,
    groundLoss: s.radials === "none",
    swr50: feedZ === 0 ? 10 : Math.max(feedZ, 50) / Math.min(feedZ, 50),
    coilReactance,
  };
}

// ---- Loop (quad, delta) ------------------------------------------------------------------------

export interface LoopState {
  mode: "loop";
  f: number;
  perimeter: number;
  shape: "quad" | "delta";
  /** Feed on the horizontal (bottom) side or on a vertical side. */
  feed: "bottom" | "side";
}

export function loopVariables(s: LoopState): Vars | null {
  if (!finite(s?.f, s?.perimeter) || s.f <= 0 || s.perimeter <= 0) return null;
  const f0 = LOOP_K / s.perimeter;
  return {
    f0,
    resonant: Math.abs(f0 - s.f) / s.f <= RESONANT_WITHIN,
    horizontal: s.feed === "bottom",
  };
}

export function antennaVariables(state: Record<string, unknown>, config: Record<string, unknown> = {}): Vars | null {
  switch (state?.mode) {
    case "yagi":
      return yagiVariables(state as unknown as YagiState);
    case "dipole":
      return dipoleVariables(state as unknown as DipoleState);
    case "vertical":
      return verticalVariables(state as unknown as VerticalState, config as VerticalConfig);
    case "loop":
      return loopVariables(state as unknown as LoopState);
  }
  return null;
}

// ---- LAB-29 radiation patterns -------------------------------------------------------------------

export interface PatternState {
  antenna: "isotropic" | "dipole" | "yagi";
  orientation: "horizontal" | "vertical";
  /** Receiving antenna's orientation (polarization). */
  rx?: "horizontal" | "vertical";
  /** A parasitic element added to the dipole. */
  parasitic?: "none" | "director" | "reflector";
}

export const DIPOLE_DBI = 2.15;

export function patternGainDbi(s: PatternState): number {
  if (s.antenna === "isotropic") return 0;
  if (s.antenna === "yagi") return DIPOLE_DBI + 6;
  return DIPOLE_DBI + (s.parasitic && s.parasitic !== "none" ? 3 : 0);
}

/**
 * Relative field strength (0..1) in direction (x, y, z), y up. Element axis: x when horizontal,
 * y when vertical. Parasitic elements and the Yagi's boom lie along z (+z toward the director).
 */
export function patternField(s: PatternState, x: number, y: number, z: number): number {
  const len = Math.hypot(x, y, z) || 1;
  const [dx, dy, dz] = [x / len, y / len, z / len];
  if (s.antenna === "isotropic") return 1;
  const along = s.orientation === "vertical" ? dy : dx;
  let f = Math.sqrt(Math.max(0, 1 - along * along));
  const dir = s.antenna === "yagi" || s.parasitic === "director" ? 1 : s.parasitic === "reflector" ? -1 : 0;
  if (dir !== 0) {
    const fb = s.antenna === "yagi" ? 20 : 12;
    const back = 10 ** (-fb / 20);
    const c = (1 + back + (1 - back) * dz * dir) / 2;
    f *= c ** (s.antenna === "yagi" ? 2 : 1);
  }
  return f;
}

export function patternVariables(s: PatternState): Vars | null {
  if (!["isotropic", "dipole", "yagi"].includes(s?.antenna) || !["horizontal", "vertical"].includes(s?.orientation))
    return null;
  const gainDbi = patternGainDbi(s);
  const matched = s.antenna === "isotropic" || !s.rx || s.rx === s.orientation;
  return {
    gainDbi,
    gainDbd: gainDbi - DIPOLE_DBI,
    isotropic: s.antenna === "isotropic",
    vertical: s.orientation === "vertical",
    matched,
    received: matched ? 0 : -20,
    forward: s.antenna === "yagi" || s.parasitic === "director" ? 1 : s.parasitic === "reflector" ? -1 : 0,
  };
}
