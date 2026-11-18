import { current, power } from "./ohm.ts";

export function seriesResistance(rs: number[]): number {
  return rs.reduce((a, b) => a + b, 0);
}

export function parallelResistance(rs: number[]): number {
  if (rs.length === 0) return Infinity;
  if (rs.some((r) => r === 0)) return 0;
  return 1 / rs.reduce((a, r) => a + 1 / r, 0);
}

export type Topology = "single" | "series" | "parallel";

export interface CircuitInput {
  topology: Topology;
  /** Source voltage, volts. */
  E: number;
  /** Resistor values, ohms. "single" uses the first. */
  resistors: number[];
  /** Open switch → no current flows. Default closed. */
  closed?: boolean;
}

export interface ResistorReading {
  R: number;
  E: number;
  I: number;
  P: number;
}

export interface CircuitReading {
  /** Total resistance seen by the source. */
  R: number;
  /** Source voltage. */
  E: number;
  /** Total current from the source (what an ammeter in series with the battery reads). */
  I: number;
  /** Total power delivered by the source. */
  P: number;
  resistors: ResistorReading[];
}

/** Ideal DC circuit: ideal source, ideal meters, zero wire resistance. */
export function solveCircuit(input: CircuitInput): CircuitReading {
  const rs = input.topology === "single" ? input.resistors.slice(0, 1) : input.resistors;
  const closed = input.closed ?? true;
  const R = input.topology === "parallel" ? parallelResistance(rs) : seriesResistance(rs);
  const I = closed ? current(input.E, R) : 0;
  const resistors: ResistorReading[] = rs.map((r) => {
    if (!closed) return { R: r, E: 0, I: 0, P: 0 };
    if (input.topology === "parallel") {
      const i = current(input.E, r);
      return { R: r, E: input.E, I: i, P: power({ E: input.E, I: i }) };
    }
    const e = I * r;
    return { R: r, E: e, I, P: power({ E: e, I }) };
  });
  return { R, E: input.E, I, P: closed ? power({ E: input.E, I }) : 0, resistors };
}
