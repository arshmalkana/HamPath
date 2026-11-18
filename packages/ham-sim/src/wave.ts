/** Power ratio in dB. */
export function powerRatioToDb(ratio: number): number {
  return 10 * Math.log10(ratio);
}
export function dbToPowerRatio(db: number): number {
  return 10 ** (db / 10);
}
/** Voltage ratio in dB (same impedance). */
export function voltageRatioToDb(ratio: number): number {
  return 20 * Math.log10(ratio);
}
/** dBi = dBd + 2.15 */
export function dbdToDbi(dbd: number): number {
  return dbd + 2.15;
}

/** Wavelength in metres from frequency in MHz (exam approximation: λ = 300 / f). */
export function wavelengthMetres(freqMHz: number): number {
  return 300 / freqMHz;
}
export function frequencyMHz(wavelengthM: number): number {
  return 300 / wavelengthM;
}
/** Period in seconds from frequency in hertz. */
export function period(freqHz: number): number {
  return 1 / freqHz;
}
/** Resonant frequency (Hz) of an LC circuit: f = 1 / (2π√(LC)). */
export function resonantFrequency(L: number, C: number): number {
  return 1 / (2 * Math.PI * Math.sqrt(L * C));
}
export function inductiveReactance(freqHz: number, L: number): number {
  return 2 * Math.PI * freqHz * L;
}
export function capacitiveReactance(freqHz: number, C: number): number {
  return 1 / (2 * Math.PI * freqHz * C);
}
