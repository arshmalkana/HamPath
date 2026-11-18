// LAB-28 Antenna Builder. Yagi mode: a three-element beam whose parasitic elements act as a
// reflector when longer than the driven element and a director when shorter.
//
// The gain and front-to-back figures are a teaching model (typical values for a three-element
// Yagi), not a NEC simulation: they show which arrangement works, not exact dB.
import type { Vars } from "./goal.ts";

export type YagiElement = "reflector" | "driven" | "director";

export interface YagiState {
  mode: "yagi";
  /** Element lengths as a fraction of the driven element's resonant half-wave (1 = resonant). */
  reflector: number;
  driven: number;
  director: number;
  /** Which element the feedline is connected to. */
  feed: YagiElement | null;
}

const REFLECTS = 1.02;
const DIRECTS = 0.98;

export interface YagiModel {
  /** Parasitic elements that are doing their job. */
  reflecting: boolean;
  directing: boolean;
  /** Forward gain over a dipole, dB. */
  gain: number;
  /** Front-to-back ratio, dB. */
  fb: number;
}

export function yagiModel(s: Pick<YagiState, "reflector" | "driven" | "director">): YagiModel {
  const reflecting = s.reflector >= s.driven * REFLECTS;
  const directing = s.director <= s.driven * DIRECTS;
  const gain = (reflecting ? 3 : 0) + (directing ? 2.5 : 0) + (reflecting && directing ? 0.5 : 0);
  const fb = reflecting && directing ? 20 : reflecting || directing ? 8 : 0;
  return { reflecting, directing, gain, fb };
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
  };
}

export function antennaVariables(state: Record<string, unknown>): Vars | null {
  if (state?.mode === "yagi") return yagiVariables(state as unknown as YagiState);
  return null;
}
