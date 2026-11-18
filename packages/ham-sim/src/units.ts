/** SI prefixes used in the Basic exam (p through G). */
export const SI_PREFIXES = [
  { symbol: "p", name: "pico", exp: -12 },
  { symbol: "n", name: "nano", exp: -9 },
  { symbol: "µ", name: "micro", exp: -6 },
  { symbol: "m", name: "milli", exp: -3 },
  { symbol: "", name: "", exp: 0 },
  { symbol: "k", name: "kilo", exp: 3 },
  { symbol: "M", name: "mega", exp: 6 },
  { symbol: "G", name: "giga", exp: 9 },
] as const;

export type Unit = "V" | "A" | "Ω" | "W" | "Hz" | "F" | "H" | "m" | "s";

export const UNIT_NAMES: Record<Unit, string> = {
  V: "volts",
  A: "amperes",
  Ω: "ohms",
  W: "watts",
  Hz: "hertz",
  F: "farads",
  H: "henrys",
  m: "metres",
  s: "seconds",
};

const UNIT_ALIASES: Record<string, Unit> = {
  v: "V",
  volt: "V",
  volts: "V",
  a: "A",
  amp: "A",
  amps: "A",
  ampere: "A",
  amperes: "A",
  ω: "Ω",
  ohm: "Ω",
  ohms: "Ω",
  w: "W",
  watt: "W",
  watts: "W",
  hz: "Hz",
  hertz: "Hz",
  f: "F",
  farad: "F",
  farads: "F",
  h: "H",
  henry: "H",
  henrys: "H",
  henries: "H",
  s: "s",
  second: "s",
  seconds: "s",
  metre: "m",
  metres: "m",
  meter: "m",
  meters: "m",
};

const PREFIX_WORDS: Record<string, number> = {
  pico: -12,
  nano: -9,
  micro: -6,
  milli: -3,
  kilo: 3,
  mega: 6,
  giga: 9,
};
const PREFIX_SYMBOLS: Record<string, number> = {
  p: -12,
  n: -9,
  u: -6,
  µ: -6,
  μ: -6,
  m: -3,
  k: 3,
  K: 3,
  M: 6,
  G: 9,
};

function lookupUnit(text: string): Unit | undefined {
  if (text === "Ω") return "Ω";
  return UNIT_ALIASES[text.toLowerCase()];
}

export interface Quantity {
  value: number;
  unit?: Unit;
}

const NUMBER_RE = /^([-+]?(?:\d{1,3}(?:[ \u202f]\d{3})+|\d+)(?:[.,]\d+)?(?:e[-+]?\d+)?|[-+]?[.,]\d+)\s*(.*)$/i;

/**
 * Parse a human-entered quantity: "10m", "10 mA", "2.2k", "0.44 amperes",
 * "300 milliamperes", "9 000 ohms", "1,5" (French decimal comma).
 * A bare symbol prefix ("10m") is read as a prefix on `expectedUnit`.
 * Returns null when the text is not a quantity.
 */
export function parseQuantity(text: string, expectedUnit?: Unit): Quantity | null {
  const s = text.trim().replace(/\u00a0/g, " ");
  const m = NUMBER_RE.exec(s);
  if (!m) return null;
  const value = Number(m[1]!.replace(/[ \u202f]/g, "").replace(",", "."));
  if (!Number.isFinite(value)) return null;
  const rest = m[2]!.trim();
  if (rest === "") return { value, unit: expectedUnit };
  if (expectedUnit && rest === expectedUnit) return { value, unit: expectedUnit };

  // Word prefixes: "milliamperes", "kilo ohms"
  const lower = rest.toLowerCase().replace(/^megohm/, "megaohm");
  // Centimetres appear in antenna answers ("67 cm"); centi isn't one of the exam's SI prefixes.
  if (/^(cm|centimet(re|er)s?)$/.test(lower)) return { value: value / 100, unit: "m" };
  for (const [word, e] of Object.entries(PREFIX_WORDS)) {
    if (lower.startsWith(word)) {
      const tail = lower.slice(word.length).trim();
      // "kilohms", "megohms": the prefix swallows the o of ohms
      const u = lookupUnit(tail) ?? (tail.startsWith("hm") ? lookupUnit(`o${tail}`) : undefined);
      if (u) return { value: value * 10 ** e, unit: u };
    }
  }

  // Exact unit ("volts", "A", "Ω"), unless it is a lone prefix letter meant as a prefix
  const direct = lookupUnit(rest);
  const lonePrefix = rest.length === 1 && rest in PREFIX_SYMBOLS;
  if (direct && !(lonePrefix && expectedUnit && direct !== expectedUnit)) {
    return { value, unit: direct };
  }

  // Symbol prefix + optional unit: "mA", "kΩ", "k", "m"
  const first = [...rest][0]!;
  if (first in PREFIX_SYMBOLS) {
    const exp = PREFIX_SYMBOLS[first]!;
    const unitText = rest.slice(first.length).trim();
    const unit = unitText === "" ? expectedUnit : lookupUnit(unitText);
    if (unitText !== "" && !unit) return null;
    return { value: value * 10 ** exp, unit };
  }
  return null;
}

/** Round to `sig` significant figures, dropping float noise (0.30000000000000004 → 0.3). */
export function roundSig(x: number, sig = 4): number {
  if (x === 0 || !Number.isFinite(x)) return x;
  return Number(x.toPrecision(sig));
}

/** Format with the best SI prefix: 0.01 A → "10 mA", 2200 Ω → "2.2 kΩ". */
export function formatQuantity(value: number, unit: Unit | "", sig = 4): string {
  if (!Number.isFinite(value)) return `∞ ${unit}`.trim();
  if (value === 0) return `0 ${unit}`.trim();
  const abs = Math.abs(value);
  let chosen: (typeof SI_PREFIXES)[number] = SI_PREFIXES[4];
  for (const p of SI_PREFIXES) {
    if (abs >= 10 ** p.exp * 0.9999999) chosen = p;
  }
  const scaled = roundSig(value / 10 ** chosen.exp, sig);
  return `${scaled} ${chosen.symbol}${unit}`.trim();
}

/** Plain number without prefixes or float noise: 0.2 → "0.2". */
export function formatNumber(x: number, sig = 6): string {
  return String(roundSig(x, sig));
}

/** Leading value (in base units) of an exam answer like "22 volts" or "300 milliamperes". */
export function parseAnswerValue(answer: string, expectedUnit?: Unit): number | null {
  return parseQuantity(answer, expectedUnit)?.value ?? null;
}

/** True when a and b agree within a relative `tolerance` (default 2%). */
export function approxEqual(a: number, b: number, tolerance = 0.02): boolean {
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= tolerance * scale;
}
