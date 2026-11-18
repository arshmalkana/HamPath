import { formatNumber, formatQuantity, type Unit } from "./units.ts";

/** The exam writes voltage as E (electromotive force). */
export type OhmVar = "E" | "I" | "R";
export const OHM_UNITS: Record<OhmVar, Unit> = { E: "V", I: "A", R: "Ω" };
export const OHM_NAMES: Record<OhmVar, string> = { E: "voltage", I: "current", R: "resistance" };

export interface WorkedSolution {
  solve: string;
  value: number;
  unit: Unit;
  formula: string;
  steps: string[];
}

export function voltage(I: number, R: number): number {
  return I * R;
}
export function current(E: number, R: number): number {
  return R === 0 ? Infinity : E / R;
}
export function resistance(E: number, I: number): number {
  return I === 0 ? Infinity : E / I;
}

const q = (v: number, k: OhmVar) => `${formatNumber(v)} ${OHM_UNITS[k]}`;

/** Solve Ohm's Law for whichever of E, I, R is missing, with worked steps. */
export function solveOhm(given: Partial<Record<OhmVar, number>>): WorkedSolution {
  const known = (["E", "I", "R"] as const).filter((k) => given[k] !== undefined);
  if (known.length !== 2) {
    throw new Error(`solveOhm needs exactly two of E, I, R (got ${known.join(",") || "none"})`);
  }
  const { E, I, R } = given;
  if (E === undefined) {
    const value = voltage(I!, R!);
    return {
      solve: "E",
      value,
      unit: "V",
      formula: "E = I × R",
      steps: ["E = I × R", `E = ${q(I!, "I")} × ${q(R!, "R")}`, `E = ${formatQuantity(value, "V")}`],
    };
  }
  if (I === undefined) {
    const value = current(E, R!);
    return {
      solve: "I",
      value,
      unit: "A",
      formula: "I = E ÷ R",
      steps: ["I = E ÷ R", `I = ${q(E, "E")} ÷ ${q(R!, "R")}`, `I = ${formatQuantity(value, "A")}`],
    };
  }
  const value = resistance(E, I);
  return {
    solve: "R",
    value,
    unit: "Ω",
    formula: "R = E ÷ I",
    steps: ["R = E ÷ I", `R = ${q(E, "E")} ÷ ${q(I, "I")}`, `R = ${formatQuantity(value, "Ω")}`],
  };
}

/** Power: P = E × I, P = I² × R, or P = E² ÷ R (whichever two are given). */
export function power(given: { E?: number; I?: number; R?: number }): number {
  const { E, I, R } = given;
  if (E !== undefined && I !== undefined) return E * I;
  if (I !== undefined && R !== undefined) return I * I * R;
  if (E !== undefined && R !== undefined) return R === 0 ? Infinity : (E * E) / R;
  throw new Error("power needs two of E, I, R");
}

export function solvePower(given: { E?: number; I?: number; R?: number }): WorkedSolution {
  const { E, I, R } = given;
  const value = power(given);
  let formula: string;
  let sub: string;
  if (E !== undefined && I !== undefined) {
    formula = "P = E × I";
    sub = `P = ${q(E, "E")} × ${q(I, "I")}`;
  } else if (I !== undefined && R !== undefined) {
    formula = "P = I² × R";
    sub = `P = (${q(I, "I")})² × ${q(R, "R")}`;
  } else {
    formula = "P = E² ÷ R";
    sub = `P = (${q(E!, "E")})² ÷ ${q(R!, "R")}`;
  }
  return { solve: "P", value, unit: "W", formula, steps: [formula, sub, `P = ${formatQuantity(value, "W")}`] };
}
