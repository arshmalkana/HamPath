import type { Vars } from "./goal.ts";
import { solveCircuit, type Topology } from "./resistors.ts";

/**
 * LAB-20 breadboard. Four sockets around one loop:
 *
 *        ┌──[ series ]──┐
 *   [ source ]       [ load ]  ║ [ across ]  (across sits in parallel with the load)
 *        └───[ switch ]─┘
 *
 * The battery belongs in `source`, the resistor in `load`, the ammeter in `series` (it closes the
 * gap in the loop) and the voltmeter `across` the resistor. Swapping the meters is allowed because
 * it teaches something: a voltmeter in series blocks the current; an ammeter across the load is a
 * short circuit that blows the meter's fuse.
 */
export const SOCKETS = ["source", "series", "load", "across"] as const;
export type Socket = (typeof SOCKETS)[number];
export const PARTS = ["battery", "resistor", "ammeter", "voltmeter"] as const;
export type PartKind = (typeof PARTS)[number];
export type Board = Partial<Record<Socket, PartKind | null>>;

/** Which parts each socket physically accepts. */
export const SOCKET_ACCEPTS: Record<Socket, readonly PartKind[]> = {
  source: ["battery"],
  series: ["ammeter", "voltmeter"],
  load: ["resistor"],
  across: ["ammeter", "voltmeter"],
};

export const CORRECT_BOARD: Required<Board> = {
  source: "battery",
  series: "ammeter",
  load: "resistor",
  across: "voltmeter",
};

export interface OhmsLabState {
  topology: Topology;
  E: number;
  resistors: number[];
  closed: boolean;
  /** Present when the learner builds the circuit; absent = prebuilt (all parts in place). */
  board?: Board;
}

export type BoardFault = "gap" | "voltmeter-in-series" | "ammeter-across-load" | null;

export interface OhmsReading {
  /** Battery, resistor and ammeter are all where they belong. */
  built: boolean;
  fault: BoardFault;
  /** True circuit current, amperes. */
  I: number;
  /** Voltage across the resistor, volts. */
  V: number;
  /** Total resistance the battery sees (the resistor), ohms. */
  R: number;
  /** Power in the resistor, watts. */
  P: number;
  /** What the ammeter shows (null: no ammeter on the board). */
  ammeter: number | null;
  /** What the voltmeter shows (null: no voltmeter on the board). */
  voltmeter: number | null;
}

export function readOhmsLab(s: OhmsLabState): OhmsReading {
  const board: Board = s.board ?? CORRECT_BOARD;
  const r = solveCircuit({ topology: s.topology, E: s.E, resistors: s.resistors, closed: s.closed });
  const has = (p: PartKind) => Object.values(board).includes(p);
  const built = board.source === "battery" && board.load === "resistor" && board.series === "ammeter";
  const sourceOk = board.source === "battery" && board.load === "resistor";

  let fault: BoardFault = null;
  let I = 0;
  let V = 0;
  let ammeter: number | null = has("ammeter") ? 0 : null;
  let voltmeter: number | null = has("voltmeter") ? 0 : null;

  if (!sourceOk || !board.series) {
    fault = sourceOk ? "gap" : null;
  } else if (board.series === "voltmeter") {
    // An ideal voltmeter has (near) infinite resistance: no current, and it reads the whole battery.
    fault = "voltmeter-in-series";
    voltmeter = s.closed ? s.E : 0;
  } else if (board.across === "ammeter") {
    // An ammeter has (near) zero resistance: across the resistor it is a short; its fuse blows.
    fault = "ammeter-across-load";
  } else if (s.closed) {
    I = r.I;
    V = r.resistors[0]?.E ?? 0;
    ammeter = board.series === "ammeter" ? I : ammeter;
    voltmeter = board.across === "voltmeter" ? V : voltmeter;
  }
  return { built, fault, I, V, R: r.R, P: I * V, ammeter, voltmeter };
}

/** Goal variables for LAB-20: E, I, V, R, P, closed, built, metered. */
export function ohmsLabVariables(s: OhmsLabState): Vars {
  const r = readOhmsLab(s);
  const board = s.board ?? CORRECT_BOARD;
  return {
    E: s.E,
    I: r.I,
    V: r.V,
    R: r.R,
    P: r.P,
    closed: s.closed,
    built: r.built,
    metered: board.across === "voltmeter",
  };
}

function isBoard(x: unknown): x is Board {
  if (x === undefined) return true;
  if (typeof x !== "object" || x === null) return false;
  return Object.entries(x).every(
    ([k, v]) =>
      (SOCKETS as readonly string[]).includes(k) &&
      (v === null || (SOCKET_ACCEPTS[k as Socket] as readonly string[]).includes(v as string)),
  );
}

function isOhmsState(x: unknown): x is OhmsLabState {
  const s = x as OhmsLabState;
  return (
    typeof s === "object" &&
    s !== null &&
    ["single", "series", "parallel"].includes(s.topology) &&
    typeof s.E === "number" &&
    Number.isFinite(s.E) &&
    s.E >= 0 &&
    Array.isArray(s.resistors) &&
    s.resistors.length >= 1 &&
    s.resistors.length <= 4 &&
    s.resistors.every((r) => typeof r === "number" && r > 0 && Number.isFinite(r)) &&
    typeof s.closed === "boolean" &&
    isBoard(s.board)
  );
}

/** Goal variables for a lab's reported state, or null if the lab/state is unknown or malformed. */
export function labVariables(labId: string, state: unknown): Vars | null {
  switch (labId) {
    case "LAB-20":
      return isOhmsState(state) ? ohmsLabVariables(state) : null;
    default:
      return null;
  }
}

/** Variables each implemented lab exposes to goal expressions (content validation uses this). */
export const LAB_GOAL_VARIABLES: Record<string, string[]> = {
  "LAB-20": ["E", "I", "V", "R", "P", "closed", "built", "metered"],
};
