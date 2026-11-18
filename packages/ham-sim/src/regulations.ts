// Canadian amateur regulations used by section 1: bands, bandwidth limits (RBR-4), power limits,
// call signs and identification. Labs (LAB-01 Band Plan Explorer, LAB-03 Call Sign Builder,
// LAB-04 power limits) and the calculators share these tables.
//
// Source: RBR-4, Standards for the Operation of Radio Stations in the Amateur Radio Service.
// To be checked against the current issue by a licensed reviewer before launch.
import type { Vars } from "./goal.ts";

const finite = (...xs: unknown[]) => xs.every((x) => typeof x === "number" && Number.isFinite(x));

export interface Band {
  name: string;
  /** Wavelength label in metres (e.g. 80), or centimetres for UHF bands. */
  metres: number;
  lo: number;
  hi: number;
  /** Maximum bandwidth, kHz. */
  bwKHz: number;
  /** SSB not allowed (30 m). */
  noSsb?: boolean;
}

/** Amateur bands in Canada (MHz). */
export const BANDS: Band[] = [
  { name: "2200 m", metres: 2200, lo: 0.1357, hi: 0.1378, bwKHz: 0.1 },
  { name: "630 m", metres: 630, lo: 0.472, hi: 0.479, bwKHz: 0.1 },
  { name: "160 m", metres: 160, lo: 1.8, hi: 2.0, bwKHz: 6 },
  { name: "80 m", metres: 80, lo: 3.5, hi: 4.0, bwKHz: 6 },
  { name: "40 m", metres: 40, lo: 7.0, hi: 7.3, bwKHz: 6 },
  { name: "30 m", metres: 30, lo: 10.1, hi: 10.15, bwKHz: 1, noSsb: true },
  { name: "20 m", metres: 20, lo: 14.0, hi: 14.35, bwKHz: 6 },
  { name: "17 m", metres: 17, lo: 18.068, hi: 18.168, bwKHz: 6 },
  { name: "15 m", metres: 15, lo: 21.0, hi: 21.45, bwKHz: 6 },
  { name: "12 m", metres: 12, lo: 24.89, hi: 24.99, bwKHz: 6 },
  { name: "10 m", metres: 10, lo: 28.0, hi: 29.7, bwKHz: 20 },
  { name: "6 m", metres: 6, lo: 50, hi: 54, bwKHz: 30 },
  { name: "2 m", metres: 2, lo: 144, hi: 148, bwKHz: 30 },
  { name: "1.25 m", metres: 1.25, lo: 222, hi: 225, bwKHz: 100 },
  { name: "70 cm", metres: 0.7, lo: 430, hi: 450, bwKHz: 12000 },
  { name: "33 cm", metres: 0.33, lo: 902, hi: 928, bwKHz: 12000 },
  { name: "23 cm", metres: 0.23, lo: 1240, hi: 1300, bwKHz: 12000 },
];

export const bandAt = (fMHz: number) => BANDS.find((b) => fMHz >= b.lo && fMHz <= b.hi);
export const bandByMetres = (m: number) => BANDS.find((b) => b.metres === m);

/** Typical occupied bandwidth by emission, kHz. */
export const EMISSION_KHZ = { cw: 0.15, ft8: 0.05, rtty: 0.25, ssb: 3, sstv: 3, fm: 15, atv: 6000 } as const;
export type Emission = keyof typeof EMISSION_KHZ;
export const EMISSION_NAMES: Record<Emission, string> = {
  cw: "CW",
  ft8: "FT8",
  rtty: "RTTY",
  ssb: "SSB voice",
  sstv: "Slow-scan TV",
  fm: "FM voice",
  atv: "Fast-scan TV",
};

export interface BandPlanState {
  /** Carrier or centre frequency, MHz. */
  f: number;
  emission: Emission;
}

export function bandPlanVariables(s: BandPlanState): Vars | null {
  if (!finite(s?.f) || !(s.emission in EMISSION_KHZ)) return null;
  const b = bandAt(s.f);
  const bw = EMISSION_KHZ[s.emission];
  // SSB sits on one side of the carrier; others are centred.
  const lo = s.emission === "ssb" ? (s.f < 10 ? s.f - bw / 1000 : s.f) : s.f - bw / 2000;
  const hi = s.emission === "ssb" ? (s.f < 10 ? s.f : s.f + bw / 1000) : s.f + bw / 2000;
  const inBand = Boolean(b);
  const edgeOk = Boolean(b && lo >= b.lo && hi <= b.hi);
  const bwOk = Boolean(b && bw <= b.bwKHz);
  const modeOk = !(b?.noSsb && s.emission === "ssb");
  return {
    inBand,
    band: b?.metres ?? 0,
    bwLimit: b?.bwKHz ?? 0,
    bw,
    bwOk,
    edgeOk,
    modeOk,
    legal: inBand && edgeOk && bwOk && modeOk,
    hf: s.f < 30,
  };
}

// ---- Power limits ------------------------------------------------------------------------------

export type Qualification = "basic" | "honours" | "advanced";
export type PowerMeasure = "dcInput" | "ssbPep" | "carrier" | "sixtyErp";

export const POWER_LIMITS: Record<Qualification, Record<PowerMeasure, number>> = {
  basic: { dcInput: 250, ssbPep: 560, carrier: 190, sixtyErp: 100 },
  honours: { dcInput: 250, ssbPep: 560, carrier: 190, sixtyErp: 100 },
  advanced: { dcInput: 1000, ssbPep: 2250, carrier: 750, sixtyErp: 100 },
};
export const MEASURE_NAMES: Record<PowerMeasure, string> = {
  dcInput: "DC input to the final stage",
  ssbPep: "SSB peak envelope power output",
  carrier: "Carrier power, emissions other than SSB",
  sixtyErp: "60 m effective radiated power (PEP)",
};

export interface PowerLimitConfig {
  qualification: Qualification;
  measure: PowerMeasure;
}
export interface PowerLimitState {
  /** Transmitter setting, W. */
  power: number;
}

export function powerLimitVariables(s: PowerLimitState, c: PowerLimitConfig): Vars | null {
  const table = POWER_LIMITS[c?.qualification];
  if (!table || !(c.measure in table) || !finite(s?.power)) return null;
  const limit = table[c.measure];
  return { limit, power: s.power, legal: s.power <= limit, atLimit: Math.abs(s.power - limit) < 1e-9 };
}

// ---- Call signs and identification -------------------------------------------------------------

export const CANADIAN_PREFIXES = ["VA", "VE", "VO", "VY"] as const;
/** Region digit → province or territory (common assignments). */
export const CALL_REGIONS: Record<string, string> = {
  VE1: "Nova Scotia",
  VA1: "Nova Scotia",
  VE2: "Quebec",
  VA2: "Quebec",
  VE3: "Ontario",
  VA3: "Ontario",
  VE4: "Manitoba",
  VA4: "Manitoba",
  VE5: "Saskatchewan",
  VA5: "Saskatchewan",
  VE6: "Alberta",
  VA6: "Alberta",
  VE7: "British Columbia",
  VA7: "British Columbia",
  VE8: "Northwest Territories",
  VE9: "New Brunswick",
  VO1: "Newfoundland",
  VO2: "Labrador",
  VY0: "Nunavut",
  VY1: "Yukon",
  VY2: "Prince Edward Island",
};

export interface CallSignConfig {
  mode: "build";
  /** Province or territory the call must belong to. */
  region: string;
}
export interface CallSignState {
  prefix: string;
  digit: string;
  suffix: string;
}

export function callSignVariables(s: CallSignState, c: CallSignConfig): Vars | null {
  if (!s || typeof s.prefix !== "string" || typeof s.digit !== "string" || typeof s.suffix !== "string") return null;
  const canadian = (CANADIAN_PREFIXES as readonly string[]).includes(s.prefix);
  const suffixOk = /^[A-Z]{2,3}$/.test(s.suffix);
  const region = CALL_REGIONS[`${s.prefix}${s.digit}`];
  const valid = canadian && suffixOk && Boolean(region);
  return { canadian, suffixOk, valid, regionOk: valid && region === c?.region };
}

export interface IdTimingConfig {
  mode: "timing";
  /** Contact length, minutes. */
  duration: number;
}
export interface IdTimingState {
  /** Minutes at which you identified. */
  ids: number[];
}

export const ID_INTERVAL_MIN = 30;

export function idTimingVariables(s: IdTimingState, c: IdTimingConfig): Vars | null {
  if (!finite(c?.duration) || !Array.isArray(s?.ids)) return null;
  const ids = [...new Set(s.ids.filter((x) => finite(x) && x >= 0 && x <= c.duration))].sort((a, b) => a - b);
  const atStart = ids[0] === 0;
  const atEnd = ids.at(-1) === c.duration;
  let maxGap = 0;
  for (let i = 1; i < ids.length; i++) maxGap = Math.max(maxGap, ids[i]! - ids[i - 1]!);
  if (ids.length < 2) maxGap = c.duration;
  return { atStart, atEnd, maxGap, count: ids.length, idOk: atStart && atEnd && maxGap <= ID_INTERVAL_MIN };
}
