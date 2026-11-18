// Section 7 propagation labs: LAB-30 Ionosphere Simulator, LAB-31 Solar Cycle Dial,
// LAB-32 VHF Propagation Sandbox and LAB-12 World Map & Clock.
//
// A teaching model: ionization follows the sun (peaking at local noon, lowest just before dawn),
// critical frequency scales with solar flux, the MUF follows the secant law, the D region absorbs
// low frequencies in daylight, and hops follow spherical geometry. Numbers are typical, not a
// forecast.
import type { Vars } from "./goal.ts";

const finite = (...xs: unknown[]) => xs.every((x) => typeof x === "number" && Number.isFinite(x));
export const EARTH_RADIUS_KM = 6371;
const RAD = Math.PI / 180;

/** Sun-driven daylight factor at a local hour: 0 at night, 1 at noon. */
export function daylight(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  return h > 6 && h < 18 ? Math.sin((Math.PI * (h - 6)) / 12) : 0;
}

/** F-region ionization (0..1): highest at midday, decaying through the night, lowest just before dawn. */
export function ionization(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  // Residual ionization decays from noon through the night, then builds again from dawn.
  const dawnLevel = Math.exp(-18 / 8);
  const residual = h >= 6 && h < 12 ? dawnLevel + (1 - dawnLevel) * ((h - 6) / 6) : Math.exp(-((h - 12 + 24) % 24) / 8);
  return 0.6 * daylight(h) + 0.4 * residual;
}

/** F2 critical frequency (MHz) for a local hour and solar flux index. */
export function criticalFrequency(hour: number, sfi = 120): number {
  return (5 + 0.05 * (sfi - 70)) * (0.35 + 0.65 * ionization(hour));
}

/** E-region critical frequency (MHz): daytime only. */
export const eCritical = (hour: number) => 3.5 * daylight(hour);

/** D-region absorption (dB, one hop) at f MHz: strong at low frequencies in daylight. */
export const dAbsorption = (hour: number, fMHz: number) => 80 * daylight(hour) * (2 / fMHz) ** 2;
export const ABSORBED_DB = 20;

export const REGION_HEIGHT_KM = { E: 90, F2: 300 } as const;

/** sin of the incidence angle at a layer of height h for a takeoff elevation (deg). */
const sinIncidence = (elevDeg: number, h: number) =>
  (EARTH_RADIUS_KM * Math.cos(elevDeg * RAD)) / (EARTH_RADIUS_KM + h);

/** Ground distance (km) of one hop off a layer at height h for a takeoff elevation (deg). */
export function hopDistance(elevDeg: number, h: number): number {
  const i = Math.asin(sinIncidence(elevDeg, h));
  const central = Math.PI / 2 - elevDeg * RAD - i;
  return 2 * EARTH_RADIUS_KM * central;
}

/** MUF (MHz) for a takeoff elevation: critical frequency × sec(incidence). */
export function mufAt(foCritical: number, elevDeg: number, h: number): number {
  const s = sinIncidence(elevDeg, h);
  return foCritical / Math.sqrt(1 - s * s);
}

/** Ground-wave range (km), longest on the lowest bands. */
export const groundWaveKm = (fMHz: number) => 300 / Math.sqrt(fMHz);

export interface IonosphereConfig {
  sfi?: number;
  /** A distant receiver (km), for hop counting and skip-zone checks. */
  rx?: number;
}
export interface IonosphereState {
  f: number;
  /** Takeoff elevation, degrees. */
  angle: number;
  /** Local hour. */
  hour: number;
}

export function ionosphereVariables(s: IonosphereState, c: IonosphereConfig = {}): Vars | null {
  if (!finite(s?.f, s?.angle, s?.hour) || s.f <= 0 || s.angle < 0 || s.angle > 90) return null;
  const sfi = c.sfi ?? 120;
  const foF2 = criticalFrequency(s.hour, sfi);
  const foE = eCritical(s.hour);
  const absorb = dAbsorption(s.hour, s.f);
  const absorbed = absorb > ABSORBED_DB && s.f < 30;
  const viaE = !absorbed && foE > 0 && s.f <= mufAt(foE, s.angle, REGION_HEIGHT_KM.E);
  const viaF = !absorbed && !viaE && s.f <= mufAt(foF2, s.angle, REGION_HEIGHT_KM.F2);
  const refracted = viaE || viaF;
  const hop = viaE ? hopDistance(s.angle, REGION_HEIGHT_KM.E) : viaF ? hopDistance(s.angle, REGION_HEIGHT_KM.F2) : 0;
  const gw = groundWaveKm(s.f);
  const rx = c.rx ?? 0;
  return {
    foF2,
    foE,
    ionization: ionization(s.hour),
    dayFactor: daylight(s.hour),
    split: daylight(s.hour) > 0.3,
    absorbed,
    absorptionDb: absorb,
    refracted,
    region: viaE ? 1 : viaF ? 2 : 0,
    escapes: !absorbed && !refracted,
    hop,
    groundWave: gw,
    skipZone: refracted ? Math.max(0, hop - gw) : 0,
    muf: mufAt(foF2, s.angle, REGION_HEIGHT_KM.F2),
    hopsToRx: refracted && rx > 0 ? Math.ceil(rx / hop) : 0,
    inSkip: refracted && rx > gw && rx < hop,
    f: s.f,
    angle: s.angle,
    hour: s.hour,
  };
}

// ---- LAB-31 Solar cycle --------------------------------------------------------------------------

export const SOLAR_CYCLE_YEARS = 11;
/** Smoothed sunspot number through an 11-year cycle (0 = minimum, 5.5 = maximum). */
export const sunspotNumber = (year: number) => 180 * Math.sin((Math.PI * year) / SOLAR_CYCLE_YEARS) ** 2;
/** Solar flux index (10.7 cm, 2800 MHz) from sunspot number. */
export const solarFlux = (ssn: number) => 63.7 + 0.728 * ssn + 0.00089 * ssn * ssn;
/** Highest frequency (MHz) usable for long-distance contacts at midday: about 3.3 × foF2. */
export const middayMuf = (sfi: number) => 3.3 * criticalFrequency(12, sfi);

export interface SolarCycleState {
  /** Years since solar minimum, 0..11. */
  year: number;
}
export function solarCycleVariables(s: SolarCycleState): Vars | null {
  if (!finite(s?.year) || s.year < 0 || s.year > SOLAR_CYCLE_YEARS) return null;
  const ssn = sunspotNumber(s.year);
  const sfi = solarFlux(ssn);
  const muf = middayMuf(sfi);
  return { year: s.year, ssn, sfi, muf, open10: muf >= 28, open20: muf >= 14.35, open6: muf >= 50 };
}

// ---- LAB-32 VHF propagation sandbox ---------------------------------------------------------------

export interface VhfState {
  /** Band in metres: 6, 2 or 0.7. */
  band: 6 | 2 | 0.7;
  /** Antenna heights at each end, m. */
  height: number;
  inversion?: boolean;
  sporadicE?: boolean;
  aurora?: boolean;
  meteors?: boolean;
  /** Beam heading, degrees true. */
  heading?: number;
}

/** Radio horizon (km) between two antennas of height h (m), with normal tropospheric refraction. */
export const radioHorizonKm = (h1: number, h2: number) => 4.12 * (Math.sqrt(h1) + Math.sqrt(h2));

export function vhfVariables(s: VhfState): Vars | null {
  if (![6, 2, 0.7].includes(s?.band) || !finite(s.height) || s.height < 0) return null;
  const horizon = radioHorizonKm(s.height, s.height);
  const heading = (((s.heading ?? 0) % 360) + 360) % 360;
  const north = heading <= 45 || heading >= 315;
  const ducting = Boolean(s.inversion);
  const es = Boolean(s.sporadicE) && s.band === 6;
  const auroraLink = Boolean(s.aurora) && north && s.band !== 0.7;
  const meteorLink = Boolean(s.meteors) && s.band === 6;
  let reach = Math.max(horizon, s.band === 6 ? 300 : s.band === 2 ? 250 : 200);
  if (ducting) reach = Math.max(reach, 1500);
  if (es) reach = Math.max(reach, 1800);
  if (meteorLink) reach = Math.max(reach, 1800);
  if (auroraLink) reach = Math.max(reach, 1200);
  return { horizon, reach, ducting, es, auroraLink, meteorLink, north, band: s.band };
}

// ---- LAB-12 World map, clock and paths -------------------------------------------------------------

export type LonLat = [number, number];

/** Great-circle distance (km). */
export function distanceKm([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const p1 = lat1 * RAD;
  const p2 = lat2 * RAD;
  const dl = (lon2 - lon1) * RAD;
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial great-circle bearing (degrees true) from a to b. */
export function bearing([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const p1 = lat1 * RAD;
  const p2 = lat2 * RAD;
  const dl = (lon2 - lon1) * RAD;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (((Math.atan2(y, x) / RAD) % 360) + 360) % 360;
}

/** Points along the great circle from a to b (inclusive). */
export function greatCircle(a: LonLat, b: LonLat, n = 64): LonLat[] {
  const toV = ([lon, lat]: LonLat) => [
    Math.cos(lat * RAD) * Math.cos(lon * RAD),
    Math.cos(lat * RAD) * Math.sin(lon * RAD),
    Math.sin(lat * RAD),
  ];
  const [va, vb] = [toV(a), toV(b)];
  const omega = Math.acos(Math.max(-1, Math.min(1, va[0]! * vb[0]! + va[1]! * vb[1]! + va[2]! * vb[2]!)));
  if (omega < 1e-9) return [a, b];
  const out: LonLat[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const k1 = Math.sin((1 - t) * omega) / Math.sin(omega);
    const k2 = Math.sin(t * omega) / Math.sin(omega);
    const v = [0, 1, 2].map((j) => k1 * va[j]! + k2 * vb[j]!);
    out.push([Math.atan2(v[1]!, v[0]!) / RAD, Math.asin(Math.max(-1, Math.min(1, v[2]!))) / RAD]);
  }
  return out;
}

export interface MapPathConfig {
  from: LonLat;
  to: LonLat;
  sfi?: number;
}
export interface MapPathState {
  /** UTC hour, 0..24. */
  utc: number;
  /** Band, MHz. */
  f: number;
}

export function mapPathVariables(s: MapPathState, c: MapPathConfig): Vars | null {
  if (!finite(s?.utc, s?.f) || !c?.from || !c?.to) return null;
  const mid = greatCircle(c.from, c.to, 2)[1]!;
  const midHour = (((s.utc + mid[0] / 15) % 24) + 24) % 24;
  const fo = criticalFrequency(midHour, c.sfi ?? 120);
  const muf = 3.3 * fo;
  const absorbed = dAbsorption(midHour, s.f) > ABSORBED_DB;
  return {
    utc: s.utc,
    midHour,
    muf,
    owf: 0.85 * muf,
    open: s.f <= muf && !absorbed,
    absorbed,
    aboveMuf: s.f > muf,
    distance: distanceKm(c.from, c.to),
    bearing: bearing(c.from, c.to),
    f: s.f,
  };
}
