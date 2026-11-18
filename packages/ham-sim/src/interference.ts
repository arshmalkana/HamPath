// Section 8: LAB-33 Interference Detective and LAB-34 Filter Designer.
import type { Vars } from "./goal.ts";

const finite = (...xs: unknown[]) => xs.every((x) => typeof x === "number" && Number.isFinite(x));

// ---- LAB-33 Interference Detective -------------------------------------------------------------

/** What's causing it. */
export const CAUSES = {
  overload: "Receiver overload (front-end overload)",
  desense: "Receiver desensitization",
  intermod: "Intermodulation",
  rectification: "Audio rectification",
  harmonics: "Harmonic emissions",
  spurious: "Spurious emissions",
  parasitic: "Parasitic oscillation",
  clicks: "Key clicks (poor keying waveform)",
  splatter: "Splatter (overmodulation)",
  commonmode: "Common-mode current on the feedline",
} as const;
export type Cause = keyof typeof CAUSES;

/** What to do about it. */
export const CURES = {
  hpfTv: "High-pass filter at the TV",
  lpfTx: "Low-pass filter at the transmitter",
  ferrite: "Ferrite cores on the audio and speaker leads",
  phoneFilter: "Plug-in RFI filter at the telephone",
  cmChoke: "Common-mode choke on the feedline",
  rxFilter: "Suitable filter at the receiver",
  separate: "More separation between the stations, and band-pass filters",
  cover: "Refit the cover and shielding",
  keying: "Check the keying filter and later stages",
  micGain: "Turn down the microphone gain",
  lessPower: "Use less power",
} as const;
export type Cure = keyof typeof CURES;

export interface InterferenceConfig {
  cause: Cause;
  cure: Cure;
}
export interface InterferenceState {
  diagnosis: Cause | null;
  cure: Cure | null;
}

export function interferenceVariables(s: InterferenceState, c: InterferenceConfig): Vars | null {
  if (!c || !(c.cause in CAUSES) || !(c.cure in CURES)) return null;
  const diagnosed = s?.diagnosis === c.cause;
  const cured = s?.cure === c.cure;
  return { diagnosed, cured, solved: diagnosed && cured };
}

// ---- LAB-34 Filter Designer ------------------------------------------------------------------------

export type FilterType = "lowpass" | "highpass" | "bandpass" | "bandreject" | "notch";
export const FILTER_NAMES: Record<FilterType, string> = {
  lowpass: "Low-pass",
  highpass: "High-pass",
  bandpass: "Band-pass",
  bandreject: "Band-reject",
  notch: "Notch",
};
const ORDER = 8;
const REJECT_FLOOR = 1e-4; // 40 dB

/** Power response (0..1) of a filter at f (MHz). f1 is the cut-off or notch centre; f2 the upper edge. */
export function filterResponse(type: FilterType, f: number, f1: number, f2 = f1): number {
  const lp = (fc: number) => 1 / (1 + (f / fc) ** (2 * ORDER));
  const hp = (fc: number) => 1 / (1 + (fc / f) ** (2 * ORDER));
  const reject = (lo: number, hi: number, scale: number) => {
    const d = f < lo ? lo - f : f > hi ? f - hi : 0;
    const w = 1 / (1 + (d / scale) ** 4);
    return 1 - (1 - REJECT_FLOOR) * w;
  };
  switch (type) {
    case "lowpass":
      return lp(f1);
    case "highpass":
      return hp(f1);
    case "bandpass":
      return lp(Math.max(f1, f2)) * hp(Math.min(f1, f2));
    case "bandreject":
      return reject(Math.min(f1, f2), Math.max(f1, f2), 0.02 * ((f1 + f2) / 2));
    case "notch":
      return reject(f1, f1, 0.003 * f1);
  }
}

export interface FilterConfig {
  /** Signals you want to keep, and the ones to get rid of (MHz). */
  wanted: number[];
  interferers: number[];
}
export interface FilterState {
  type: FilterType;
  f1: number;
  f2?: number;
}

export const WANTED_MIN = 0.8; // within about 1 dB
export const REJECT_DB = 15;

export function filterVariables(s: FilterState, c: FilterConfig): Vars | null {
  if (!s || !(s.type in FILTER_NAMES) || !finite(s.f1) || s.f1 <= 0 || !c || !Array.isArray(c.wanted)) return null;
  const f2 = typeof s.f2 === "number" ? s.f2 : s.f1;
  const r = (f: number) => filterResponse(s.type, f, s.f1, f2);
  const wantedMin = Math.min(...c.wanted.map(r));
  const worstInterferer = Math.max(...c.interferers.map(r));
  const rejectDb = -10 * Math.log10(Math.max(worstInterferer, 1e-12));
  return {
    wantedMin,
    rejectDb,
    ok: wantedMin >= WANTED_MIN && rejectDb >= REJECT_DB,
    lowpass: s.type === "lowpass",
    highpass: s.type === "highpass",
    bandpass: s.type === "bandpass",
    bandreject: s.type === "bandreject",
    notch: s.type === "notch",
  };
}
