import type { Vars } from "./goal.ts";
import {
  combineVariables,
  dbLadderVariables,
  resonanceVariables,
  scopeVariables,
  transformerVariables,
  unitSliderVariables,
  type CombineState,
  type DbLadderState,
  type ResonanceState,
  type ScopeState,
  type TransformerState,
  type UnitSliderState,
} from "./lab-models.ts";
import { solveCircuit, type Topology } from "./resistors.ts";
import { blockDiagramVariables, type DiagramConfig, type DiagramState } from "./diagrams.ts";
import { spectrumVariables, type SpectrumConfig, type SpectrumState } from "./spectrum.ts";
import { antennaVariables, patternVariables, type PatternState } from "./antennas.ts";
import {
  filterVariables,
  interferenceVariables,
  type FilterConfig,
  type FilterState,
  type InterferenceConfig,
  type InterferenceState,
} from "./interference.ts";
import {
  ionosphereVariables,
  mapPathVariables,
  solarCycleVariables,
  vhfVariables,
  type IonosphereConfig,
  type IonosphereState,
  type MapPathConfig,
  type MapPathState,
  type SolarCycleState,
  type VhfState,
} from "./propagation.ts";
import {
  feedlineVariables,
  swrVariables,
  type FeedlineConfig,
  type FeedlineState,
  type SwrConfig,
  type SwrState,
} from "./feedline.ts";
import {
  inspectorVariables,
  keyerVariables,
  powerBenchVariables,
  rfExposureVariables,
  ssbDriveVariables,
  type InspectorConfig,
  type InspectorState,
  type KeyerConfig,
  type KeyerState,
  type PowerBenchConfig,
  type PowerBenchState,
  type RfExposureConfig,
  type RfExposureState,
  type SsbDriveConfig,
  type SsbDriveState,
} from "./station.ts";
import { benchVariables, colourCodeVariables, type BenchState, type ColourCodeState } from "./components.ts";

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
  // Series/parallel networks report circuit totals: total current, voltage across the network,
  // total resistance and total power. (The breadboard reading describes a single resistor.)
  const net =
    s.topology === "single"
      ? null
      : solveCircuit({ topology: s.topology, E: s.E, resistors: s.resistors, closed: s.closed });
  return {
    E: s.E,
    I: net ? net.I : r.I,
    V: net ? (s.closed ? s.E : 0) : r.V,
    R: net ? net.R : r.R,
    P: net ? net.P : r.P,
    closed: s.closed,
    built: r.built,
    metered: board.across === "voltmeter",
    count: s.resistors.length,
    ...perResistor(s),
  };
}

/** I1..I4 and V1..V4: current through and voltage across each resistor (series and parallel circuits). */
function perResistor(s: OhmsLabState): Vars {
  const c = solveCircuit({ topology: s.topology, E: s.E, resistors: s.resistors, closed: s.closed });
  const out: Vars = {};
  c.resistors.forEach((r, i) => {
    out[`I${i + 1}`] = r.I;
    out[`V${i + 1}`] = r.E;
  });
  return out;
}

/** LAB-25 Meter Lab: the same breadboard, judged on where the meters went. */
export function meterLabVariables(s: OhmsLabState): Vars {
  const v = ohmsLabVariables(s);
  const board = s.board ?? CORRECT_BOARD;
  const r = readOhmsLab(s);
  return {
    ...v,
    metersCorrect: board.series === "ammeter" && board.across === "voltmeter",
    blownFuse: r.fault === "ammeter-across-load",
    blocked: r.fault === "voltmeter-in-series",
    ammeter: r.ammeter ?? -1,
    voltmeter: r.voltmeter ?? -1,
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
/**
 * Goal variables for a lab's reported state, or null if the lab or state is unknown or malformed.
 * `config` is the lesson step's config (from the database, never from the browser): labs whose
 * goals depend on fixed values (e.g. the quantity in LAB-19) read them from here.
 */
export function labVariables(labId: string, state: unknown, config: Record<string, unknown> = {}): Vars | null {
  const st = (state ?? {}) as Record<string, unknown>;
  switch (labId) {
    case "LAB-20":
      if (config.mode === "combine") return combineVariables(st as unknown as CombineState);
      return isOhmsState(state) ? ohmsLabVariables(state) : null;
    case "LAB-25":
      return isOhmsState(state) ? meterLabVariables(state) : null;
    case "LAB-19":
      return unitSliderVariables(st as unknown as UnitSliderState, config as { quantity?: string; unit?: string });
    case "LAB-21":
      return scopeVariables(st as unknown as ScopeState);
    case "LAB-22":
      return dbLadderVariables(st as unknown as DbLadderState);
    case "LAB-23":
      return transformerVariables(st as unknown as TransformerState);
    case "LAB-24":
      return resonanceVariables(st as unknown as ResonanceState);
    case "LAB-13":
      return blockDiagramVariables(st as unknown as DiagramState, config as unknown as DiagramConfig);
    case "LAB-14":
      return spectrumVariables(st as unknown as SpectrumState, config as SpectrumConfig);
    case "LAB-28":
      return antennaVariables(st, config);
    case "LAB-33":
      return interferenceVariables(st as unknown as InterferenceState, config as unknown as InterferenceConfig);
    case "LAB-34":
      return filterVariables(st as unknown as FilterState, config as unknown as FilterConfig);
    case "LAB-30":
      return ionosphereVariables(st as unknown as IonosphereState, config as IonosphereConfig);
    case "LAB-31":
      return solarCycleVariables(st as unknown as SolarCycleState);
    case "LAB-32":
      return vhfVariables(st as unknown as VhfState);
    case "LAB-12":
      return mapPathVariables(st as unknown as MapPathState, config as unknown as MapPathConfig);
    case "LAB-29":
      return patternVariables(st as unknown as PatternState);
    case "LAB-26":
      return feedlineVariables(st as unknown as FeedlineState, config as unknown as FeedlineConfig);
    case "LAB-27":
      return swrVariables(st as unknown as SwrState, config as unknown as SwrConfig);
    case "LAB-04":
      return ssbDriveVariables(st as unknown as SsbDriveState, config as unknown as SsbDriveConfig);
    case "LAB-10":
      return keyerVariables(st as unknown as KeyerState, config as unknown as KeyerConfig);
    case "LAB-15":
      return powerBenchVariables(st as unknown as PowerBenchState, config as unknown as PowerBenchConfig);
    case "LAB-16":
      return inspectorVariables(st as unknown as InspectorState, config as unknown as InspectorConfig);
    case "LAB-05":
      return rfExposureVariables(st as unknown as RfExposureState, config as unknown as RfExposureConfig);
    case "LAB-17":
      return benchVariables(st as unknown as BenchState);
    case "LAB-18":
      return colourCodeVariables(st as unknown as ColourCodeState);
    default:
      return null;
  }
}

/** Variables each implemented lab exposes to goal expressions (content validation uses this). */
export const LAB_GOAL_VARIABLES: Record<string, string[]> = {
  "LAB-20": [
    "E",
    "I",
    "V",
    "R",
    "P",
    "closed",
    "built",
    "metered",
    "count",
    "I1",
    "I2",
    "I3",
    "I4",
    "V1",
    "V2",
    "V3",
    "V4",
    "total",
    "ratio",
    "series",
  ],
  "LAB-25": [
    "E",
    "I",
    "V",
    "R",
    "P",
    "closed",
    "built",
    "metered",
    "metersCorrect",
    "blownFuse",
    "blocked",
    "ammeter",
    "voltmeter",
  ],
  "LAB-19": ["exp", "base", "mantissa"],
  "LAB-21": ["f", "T", "wavelength", "harmonic", "phase", "XL", "XC", "audio", "hf"],
  "LAB-22": ["P0", "db", "ratio", "Pout"],
  "LAB-23": ["ratio", "Vs", "Is", "Ip", "Pout", "Pin", "Zp", "stepUp"],
  "LAB-24": ["f0", "f", "XL", "XC", "Z", "Q", "bandwidth", "atResonance", "parallel"],
  "LAB-17": [
    "current",
    "forward",
    "conducting",
    "regulating",
    "saturated",
    "cutoff",
    "reverseBias",
    "gain",
    "drive",
    "outputPeak",
    "distorted",
    "rectified",
  ],
  "LAB-18": ["R", "tol", "min", "max", "score"],
  "LAB-13": ["placed", "total", "wrong", "complete", "found"],
  "LAB-14": [
    "bw",
    "filter",
    "passed",
    "lost",
    "qrm",
    "excess",
    "tuneError",
    "natural",
    "agc",
    "swing",
    "deviation",
    "audio",
    "overdeviated",
    "chirp",
    "clicks",
    "squelched",
    "minSnr",
  ],
  "LAB-04": ["drive", "alc", "alcOver", "pep", "avg", "processor", "distorted", "splatter", "bandwidth"],
  "LAB-10": ["keyer", "elements", "correct", "timingError", "clean"],
  "LAB-15": [
    "V",
    "Ah",
    "sag",
    "terminal",
    "drop",
    "atRadio",
    "hours",
    "protected",
    "fused",
    "rfNoise",
    "regulated",
    "chirp",
  ],
  "LAB-16": ["correct", "wrong", "total", "hazards", "hazardsFound", "complete"],
  "LAB-05": ["S", "d", "limit", "ratio", "safe", "safeDistance"],
  "LAB-28": [
    "reflecting",
    "directing",
    "gain",
    "fb",
    "reflectorLongest",
    "directorShortest",
    "fedDriven",
    "fed",
    "directors",
    "spacing",
    "f0",
    "resonant",
    "tooLong",
    "tooShort",
    "beamEW",
    "beamNS",
    "feedZ",
    "groundLoss",
    "swr50",
    "coilReactance",
    "horizontal",
  ],
  "LAB-33": ["diagnosed", "cured", "solved"],
  "LAB-34": ["wantedMin", "rejectDb", "ok", "lowpass", "highpass", "bandpass", "bandreject", "notch"],
  "LAB-30": [
    "foF2",
    "foE",
    "ionization",
    "dayFactor",
    "split",
    "absorbed",
    "absorptionDb",
    "refracted",
    "region",
    "escapes",
    "hop",
    "groundWave",
    "skipZone",
    "muf",
    "hopsToRx",
    "inSkip",
    "f",
    "angle",
    "hour",
  ],
  "LAB-31": ["year", "ssn", "sfi", "muf", "open10", "open20", "open6"],
  "LAB-32": ["horizon", "reach", "ducting", "es", "auroraLink", "meteorLink", "north", "band"],
  "LAB-12": ["utc", "midHour", "muf", "owf", "open", "absorbed", "aboveMuf", "distance", "bearing", "f"],
  "LAB-29": ["gainDbi", "gainDbd", "isotropic", "vertical", "matched", "received", "forward"],
  "LAB-26": ["Z0", "vf", "lossDb", "delivered", "length", "f", "balanced", "commonMode"],
  "LAB-27": ["swr", "stationSwr", "rigSwr", "reflected", "matched", "power", "foldback", "f0", "fault"],
};
