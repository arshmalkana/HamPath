import { solveOhm, solvePower, type OhmVar, type WorkedSolution } from "./ohm.ts";
import { formatNumber, parseQuantity, type Unit } from "./units.ts";

/**
 * A calculation spec, authored in content next to the question:
 *   { calc: "ohm", given: { I: "200 mA", R: "25 ohms" } }
 * `runCalculation` reproduces the answer and the worked solution shown on a miss.
 */
export interface CalcSpec {
  calc: "ohm" | "power";
  given: Record<string, string | number>;
}

const VAR_UNITS: Record<string, Unit> = { E: "V", I: "A", R: "Ω", P: "W" };

function parseGiven(spec: CalcSpec): { values: Record<string, number>; conversions: string[] } {
  const values: Record<string, number> = {};
  const conversions: string[] = [];
  for (const [k, raw] of Object.entries(spec.given)) {
    const unit = VAR_UNITS[k];
    if (!unit) throw new Error(`Unknown variable '${k}' in ${spec.calc} calculation`);
    if (typeof raw === "number") {
      values[k] = raw;
      continue;
    }
    const qty = parseQuantity(raw, unit);
    if (!qty) throw new Error(`Cannot parse '${raw}' for ${k}`);
    if (qty.unit && qty.unit !== unit) throw new Error(`'${raw}' is not in ${unit} for ${k}`);
    values[k] = qty.value;
    // Show the unit conversion as its own step when the text used a prefix (e.g. 200 mA)
    const plain = parseQuantity(raw.replace(/[^\d.,\s].*$/, "").trim());
    if (plain && plain.value !== qty.value) {
      conversions.push(`${raw.trim()} = ${formatNumber(qty.value)} ${unit}`);
    }
  }
  return { values, conversions };
}

export function runCalculation(spec: CalcSpec): WorkedSolution {
  const { values, conversions } = parseGiven(spec);
  let sol: WorkedSolution;
  switch (spec.calc) {
    case "ohm":
      sol = solveOhm(values as Partial<Record<OhmVar, number>>);
      break;
    case "power":
      sol = solvePower(values);
      break;
    default:
      throw new Error(`Unknown calculator '${(spec as CalcSpec).calc}'`);
  }
  return { ...sol, steps: [...conversions, ...sol.steps] };
}
