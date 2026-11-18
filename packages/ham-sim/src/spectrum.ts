// LAB-14 Mode Spectrum Lab: how wide each emission is, and what a receiver filter lets through.
//
// Frequencies are offsets in hertz from the centre of the wanted signal. The receiver's filter is
// centred on the dial; `tune` is how far the dial sits from the wanted signal's centre.
import type { Vars } from "./goal.ts";

export interface ModeSpec {
  name: string;
  /** Typical occupied bandwidth, Hz. */
  bw: number;
  /** Voice or data that sounds wrong when mistuned by more than this (Hz); undefined = tolerant. */
  tuneTolerance?: number;
}

export const MODE_SPECS = {
  cw: { name: "CW", bw: 150 },
  ssb: { name: "SSB voice", bw: 2400, tuneTolerance: 100 },
  am: { name: "AM voice", bw: 6000 },
  fm: { name: "FM voice", bw: 12000 },
  rtty: { name: "RTTY", bw: 250, tuneTolerance: 50 },
  psk31: { name: "PSK31", bw: 60, tuneTolerance: 10 },
  ft8: { name: "FT8", bw: 50 },
  packet: { name: "1200-baud packet (on FM)", bw: 12000 },
} satisfies Record<string, ModeSpec>;
export type Mode = keyof typeof MODE_SPECS;
export const MODES = Object.keys(MODE_SPECS) as Mode[];

export interface SpectrumConfig {
  /** An interfering signal: its mode and its centre's offset from the wanted signal's centre (Hz). */
  qrm?: { mode: Mode; offset: number } | null;
}

export interface SpectrumState {
  mode: Mode;
  /** Receiver filter width, Hz. */
  filter: number;
  /** Dial offset from the wanted signal's centre, Hz. */
  tune: number;
  agc?: boolean;
}

/** Overlap of [a1, a2] and [b1, b2]. */
function overlap(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

/** Fraction (0..1) of a signal `bw` wide, centred `centre` Hz from the dial, inside a `filter`-wide passband. */
export function fractionPassed(bw: number, centre: number, filter: number): number {
  return overlap(-filter / 2, filter / 2, centre - bw / 2, centre + bw / 2) / bw;
}

export function spectrumVariables(state: SpectrumState, config: SpectrumConfig = {}): Vars | null {
  const spec = (MODE_SPECS as Record<string, ModeSpec>)[state?.mode];
  if (!spec) return null;
  const { filter, tune } = state;
  if (![filter, tune].every((x) => typeof x === "number" && Number.isFinite(x)) || filter <= 0) return null;
  // The wanted signal sits at -tune relative to the dial.
  const passed = fractionPassed(spec.bw, -tune, filter);
  let qrm = 0;
  if (config.qrm) {
    const q = (MODE_SPECS as Record<string, ModeSpec>)[config.qrm.mode];
    if (q) qrm = fractionPassed(q.bw, config.qrm.offset - tune, filter);
  }
  const tuneError = Math.abs(tune);
  const agc = Boolean(state.agc);
  return {
    bw: spec.bw,
    filter,
    passed,
    lost: passed < 0.95,
    qrm,
    excess: Math.max(0, filter - spec.bw),
    tuneError,
    natural: spec.tuneTolerance === undefined || tuneError <= spec.tuneTolerance,
    agc,
    /** How much the audio level swings (dB) as a signal fades between S3 and S9+30. */
    swing: agc ? 3 : 66,
  };
}
