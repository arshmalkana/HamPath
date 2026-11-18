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
  /** Roughly the weakest signal still copied, as SNR in a 2500 Hz bandwidth (dB). */
  minSnr?: number;
}

export const MODE_SPECS = {
  cw: { name: "CW", bw: 150, minSnr: -15 },
  ssb: { name: "SSB voice", bw: 2400, tuneTolerance: 100, minSnr: 6 },
  am: { name: "AM voice", bw: 6000, minSnr: 10 },
  fm: { name: "FM voice", bw: 16000, minSnr: 12 },
  rtty: { name: "RTTY", bw: 250, tuneTolerance: 50, minSnr: -5 },
  psk31: { name: "PSK31", bw: 60, tuneTolerance: 10, minSnr: -10 },
  ft8: { name: "FT8", bw: 50, minSnr: -20 },
  packet: { name: "1200-baud packet (on FM)", bw: 16000, minSnr: 12 },
} satisfies Record<string, ModeSpec>;
export type Mode = keyof typeof MODE_SPECS;
export const MODES = Object.keys(MODE_SPECS) as Mode[];

export interface SpectrumConfig {
  /** An interfering signal: its mode and its centre's offset from the wanted signal's centre (Hz). */
  qrm?: { mode: Mode; offset: number } | null;
  /** FM: the deviation the repeater or channel expects (Hz). */
  expectedDeviation?: number;
}

/** Highest voice frequency carried, Hz (sets AM and FM bandwidth). */
export const VOICE_TOP = 3000;
/** Frequency shift each time a CW transmitter on an unregulated supply is keyed, Hz. */
export const CHIRP_HZ = 60;
/** Extra width of CW keyed with hard, unshaped edges (key clicks), Hz. */
export const CLICK_HZ = 1500;

export interface SpectrumState {
  mode: Mode;
  /** Receiver filter width, Hz. */
  filter: number;
  /** Dial offset from the wanted signal's centre, Hz. */
  tune: number;
  agc?: boolean;
  /** FM deviation, Hz. */
  deviation?: number;
  /** CW: steady (regulated) supply, and shaped keying edges. */
  regulated?: boolean;
  shaped?: boolean;
  /** FM receiver squelch. */
  squelch?: boolean;
}

/** Occupied bandwidth for a state: FM follows Carson's rule, 2 × (deviation + highest audio). */
export function occupiedBandwidth(s: Pick<SpectrumState, "mode" | "deviation" | "shaped">): number {
  const spec = (MODE_SPECS as Record<string, ModeSpec>)[s.mode];
  if (!spec) return NaN;
  if ((s.mode === "fm" || s.mode === "packet") && typeof s.deviation === "number") return 2 * (s.deviation + VOICE_TOP);
  if (s.mode === "cw" && s.shaped === false) return spec.bw + CLICK_HZ;
  return spec.bw;
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
  const bw = occupiedBandwidth(state);
  // The wanted signal sits at -tune relative to the dial.
  const passed = fractionPassed(bw, -tune, filter);
  let qrm = 0;
  if (config.qrm) {
    const q = (MODE_SPECS as Record<string, ModeSpec>)[config.qrm.mode];
    if (q) qrm = fractionPassed(q.bw, config.qrm.offset - tune, filter);
  }
  const tuneError = Math.abs(tune);
  const agc = Boolean(state.agc);
  const deviation = typeof state.deviation === "number" ? state.deviation : 0;
  const expected = config.expectedDeviation ?? 5000;
  return {
    bw,
    filter,
    passed,
    lost: passed < 0.95,
    qrm,
    excess: Math.max(0, filter - bw),
    tuneError,
    natural: spec.tuneTolerance === undefined || tuneError <= spec.tuneTolerance,
    agc,
    /** How much the audio level swings (dB) as a signal fades between S3 and S9+30. */
    swing: agc ? 3 : 66,
    deviation,
    /** Received audio level relative to normal (1 = matches the expected deviation). */
    audio: deviation / expected,
    overdeviated: deviation > expected * 1.1,
    chirp: state.mode === "cw" && state.regulated === false ? CHIRP_HZ : 0,
    clicks: state.mode === "cw" && state.shaped === false ? CLICK_HZ : 0,
    squelched: Boolean(state.squelch),
    minSnr: spec.minSnr ?? 0,
  };
}
