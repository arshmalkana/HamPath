// LAB-26 Feedline Lab and LAB-27 SWR Bridge & Tuner.
//
// Loss figures are typical published values (dB per 100 m at 100 MHz), scaled with √f: a teaching
// model that ranks the lines correctly, not a datasheet.
import type { Vars } from "./goal.ts";

const finite = (...xs: unknown[]) => xs.every((x) => typeof x === "number" && Number.isFinite(x));

export interface LineType {
  name: string;
  balanced: boolean;
  z0: number;
  vf: number;
  /** Matched loss, dB per 100 m at 100 MHz. */
  loss100: number;
}

export const LINE_TYPES = {
  rg58: { name: "RG-58 coax", balanced: false, z0: 50, vf: 0.66, loss100: 16 },
  rg213: { name: "RG-213 coax", balanced: false, z0: 50, vf: 0.66, loss100: 6.5 },
  foam: { name: "Low-loss foam coax", balanced: false, z0: 50, vf: 0.85, loss100: 4 },
  twinlead: { name: "300-ohm twin-lead", balanced: true, z0: 300, vf: 0.8, loss100: 4 },
  window: { name: "450-ohm window line", balanced: true, z0: 450, vf: 0.91, loss100: 3 },
  openwire: { name: "600-ohm open-wire line", balanced: true, z0: 600, vf: 0.97, loss100: 0.6 },
} satisfies Record<string, LineType>;
export type LineId = keyof typeof LINE_TYPES;

/** Relative permittivity and velocity factor of coax dielectrics. */
export const DIELECTRICS = {
  solid: { name: "Solid polyethylene", er: 2.25 },
  foam: { name: "Foam polyethylene", er: 1.4 },
  air: { name: "Air", er: 1 },
} as const;
export type Dielectric = keyof typeof DIELECTRICS;

/** Coax: Z0 = (138 / √εr) · log10(D / d). */
export function coaxZ0(D: number, d: number, er: number): number {
  return (138 / Math.sqrt(er)) * Math.log10(D / d);
}
/** Two-wire line: Z0 = 276 · log10(2S / d) (S = centre spacing, d = wire diameter). */
export function openWireZ0(S: number, d: number): number {
  return 276 * Math.log10((2 * S) / d);
}
/** Matched line loss in dB for a length (m) at a frequency (Hz). */
export function lineLossDb(line: LineType, lengthM: number, fHz: number): number {
  return line.loss100 * Math.sqrt(fHz / 100e6) * (lengthM / 100);
}

export interface FeedlineConfig {
  mode: "coax-geometry" | "open-geometry" | "loss" | "balun";
  /** Balun mode: what the far end is. */
  antenna?: "dipole";
}
export interface FeedlineState {
  line: LineId;
  length: number;
  f: number;
  balun?: boolean;
  /** Coax geometry (mm) and dielectric; open-wire spacing and wire diameter (mm). */
  D?: number;
  d?: number;
  dielectric?: Dielectric;
  S?: number;
}

export function feedlineVariables(s: FeedlineState, c: FeedlineConfig): Vars | null {
  const line = (LINE_TYPES as Record<string, LineType>)[s?.line];
  if (!line || !finite(s.length, s.f) || s.length < 0 || s.f <= 0) return null;
  let Z0 = line.z0;
  let vf = line.vf;
  if (c?.mode === "coax-geometry") {
    const diel = DIELECTRICS[s.dielectric ?? "solid"];
    if (!diel || !finite(s.D, s.d) || s.D! <= s.d! || s.d! <= 0) return null;
    Z0 = coaxZ0(s.D!, s.d!, diel.er);
    vf = 1 / Math.sqrt(diel.er);
  } else if (c?.mode === "open-geometry") {
    if (!finite(s.S, s.d) || s.S! <= s.d! || s.d! <= 0) return null;
    Z0 = openWireZ0(s.S!, s.d!);
  }
  const lossDb = lineLossDb(line, s.length, s.f);
  // A coax feeding a dipole, or balanced line on an unbalanced tuner, needs a balun.
  const commonMode = !s.balun && (line.balanced ? true : c?.antenna === "dipole");
  return {
    Z0,
    vf,
    lossDb,
    delivered: 10 ** (-lossDb / 10),
    length: s.length,
    f: s.f,
    balanced: line.balanced,
    commonMode,
  };
}

// ---- LAB-27 SWR bridge, antenna analyzer and tuner -----------------------------------------------

interface Complex {
  re: number;
  im: number;
}
const cx = (re: number, im = 0): Complex => ({ re, im });
const add = (a: Complex, b: Complex) => cx(a.re + b.re, a.im + b.im);
const sub = (a: Complex, b: Complex) => cx(a.re - b.re, a.im - b.im);
const div = (a: Complex, b: Complex) => {
  const m = b.re * b.re + b.im * b.im;
  return cx((a.re * b.re + a.im * b.im) / m, (a.im * b.re - a.re * b.im) / m);
};
const inv = (a: Complex) => div(cx(1), a);
const abs = (a: Complex) => Math.hypot(a.re, a.im);

/** Magnitude of the reflection coefficient of impedance z on a line of impedance z0. */
export function gamma(z: Complex, z0 = 50): number {
  return abs(div(sub(z, cx(z0)), add(z, cx(z0))));
}
export const swrFromGamma = (g: number) => (g >= 1 ? Infinity : (1 + g) / (1 - g));

export interface SwrConfig {
  /** The antenna's feed impedance at resonance. */
  r: number;
  x: number;
  /** Frequency (MHz) the antenna resonates at when `length` is 1. */
  fDesign: number;
  /** Fault in the antenna system. */
  fault?: "open" | "short" | null;
  /** Rated transceiver power, W. */
  rated?: number;
}
export interface SwrState {
  /** Antenna length relative to its design length (1 = as built). */
  length: number;
  /** Operating frequency, MHz. */
  f: number;
  /** Feedline loss, dB (one way). */
  lineLoss?: number;
  /** Matching transformer ratio (impedance), e.g. 6 for 6:1. */
  ratio?: number;
  /** Tuner: series inductive reactance and shunt capacitive reactance (Ω); null = bypassed. */
  tuner?: { xl: number; xc: number } | null;
  repaired?: boolean;
}

/** Antenna impedance: reactance swings ±1000 Ω per 100% off resonance. */
export function antennaImpedance(c: SwrConfig, length: number, f: number): Complex {
  const f0 = c.fDesign / length;
  return cx(c.r, c.x + 1000 * (f / f0 - 1));
}

export function swrVariables(s: SwrState, c: SwrConfig): Vars | null {
  if (!finite(s?.length, s?.f, c?.r, c?.x, c?.fDesign) || s.length <= 0 || s.f <= 0) return null;
  const fault = s.repaired ? null : c.fault;
  let z = fault === "open" ? cx(1e9) : fault === "short" ? cx(1e-6) : antennaImpedance(c, s.length, s.f);
  const ratio = s.ratio && s.ratio > 0 ? s.ratio : 1;
  z = cx(z.re / ratio, z.im / ratio);
  const gLine = gamma(z);
  const loss = s.lineLoss && s.lineLoss > 0 ? s.lineLoss : 0;
  // Reflected wave loses the line loss going out and again coming back.
  const gStation = gLine * 10 ** (-(2 * loss) / 20);
  let gRig = gStation;
  if (s.tuner && finite(s.tuner.xl, s.tuner.xc) && s.tuner.xc > 0) {
    const zt = add(cx(0, s.tuner.xl), inv(add(cx(0, 1 / s.tuner.xc), inv(z))));
    gRig = gamma(zt);
  }
  const swr = swrFromGamma(gLine);
  const rigSwr = swrFromGamma(gRig);
  const rated = c.rated ?? 100;
  return {
    swr,
    stationSwr: swrFromGamma(gStation),
    rigSwr,
    reflected: gStation * gStation,
    matched: rigSwr <= 1.5,
    power: rigSwr <= 2 ? rated : Math.round((rated * 2) / rigSwr),
    foldback: rigSwr > 2,
    f0: c.fDesign / s.length,
    fault: fault ? 1 : 0,
  };
}

/** SWR across a frequency sweep, as an antenna analyzer shows it. */
export function swrSweep(c: SwrConfig, s: SwrState, fLo: number, fHi: number, n = 120): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const f = fLo + ((fHi - fLo) * i) / n;
    const v = swrVariables({ ...s, f, tuner: null }, c);
    out.push([f, Math.min(10, (v?.swr as number) ?? 10)]);
  }
  return out;
}
