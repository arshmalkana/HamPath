// Section 2 operating labs: scenarios (LAB-07 QSO Simulator, LAB-11 Emergency Net), drills
// (LAB-09 Phonetic & Q-Code Trainer, LAB-10 Morse copy), LAB-08 Repeater Lab and LAB-12's clock mode.
import type { Vars } from "./goal.ts";
import { bearing, distanceKm, type LonLat } from "./propagation.ts";

const finite = (...xs: unknown[]) => xs.every((x) => typeof x === "number" && Number.isFinite(x));

// ---- Scenarios ---------------------------------------------------------------------------------

export interface ScenarioOption {
  text: string;
  correct?: boolean;
  feedback: string;
}
export interface ScenarioTurn {
  /** What's happening, or what you just heard. */
  situation: string;
  options: ScenarioOption[];
}
export interface ScenarioConfig {
  turns: ScenarioTurn[];
}
export interface ScenarioState {
  /** The option picked on each turn so far (a turn is passed when its pick is correct). */
  picks: number[];
}

export function scenarioVariables(s: ScenarioState, c: ScenarioConfig): Vars | null {
  if (!c || !Array.isArray(c.turns) || c.turns.length === 0) return null;
  const picks = Array.isArray(s?.picks) ? s.picks : [];
  let passed = 0;
  for (let i = 0; i < c.turns.length; i++) {
    if (c.turns[i]!.options[picks[i] ?? -1]?.correct) passed++;
    else break;
  }
  return { passed, total: c.turns.length, complete: passed === c.turns.length };
}

// ---- Drills ------------------------------------------------------------------------------------

export interface DrillItem {
  id: string;
  /** What's shown (or played, for Morse). */
  prompt: string;
  answer: string;
}
export interface DrillConfig {
  items: DrillItem[];
  /** How many must be right to finish. */
  target: number;
}
export interface DrillState {
  /** id → the answer chosen (first try counts). */
  answers: Record<string, string>;
}

export function drillVariables(s: DrillState, c: DrillConfig): Vars | null {
  if (!c || !Array.isArray(c.items) || !finite(c.target)) return null;
  const a = s?.answers ?? {};
  let correct = 0;
  let attempted = 0;
  for (const it of c.items) {
    if (a[it.id] === undefined) continue;
    attempted++;
    if (a[it.id] === it.answer) correct++;
  }
  return { correct, attempted, total: c.items.length, done: correct >= c.target };
}

/** Deterministic multiple-choice options for a drill item: the answer plus three others from the deck. */
export function drillChoices(c: DrillConfig, index: number, n = 4): string[] {
  const answers = [...new Set(c.items.map((i) => i.answer))];
  const right = c.items[index]!.answer;
  const others = answers.filter((x) => x !== right);
  const picked: string[] = [];
  for (let k = 0; picked.length < n - 1 && k < others.length; k++)
    picked.push(others[(index * 7 + k * 3) % others.length]!);
  const unique = [...new Set(picked)].slice(0, n - 1);
  const all = [...unique];
  all.splice(index % (unique.length + 1), 0, right);
  return all;
}

// ---- LAB-08 Repeater Lab ------------------------------------------------------------------------

export interface RepeaterConfig {
  /** Repeater output (what you listen to), MHz. */
  output: number;
  /** Repeater offset, kHz (input = output + offset). */
  offset: number;
  /** Required CTCSS tone (Hz), or null for none. */
  tone: number | null;
  /** Can you hear the other station directly? */
  hearsDirect?: boolean;
}
export interface RepeaterState {
  offset: number;
  tone: number | null;
  /** Listening on the input frequency ("reverse"). */
  reverse?: boolean;
}

export function repeaterVariables(s: RepeaterState, c: RepeaterConfig): Vars | null {
  if (!c || !finite(c.output, c.offset, s?.offset)) return null;
  const input = c.output + c.offset / 1000;
  const tx = c.output + s.offset / 1000;
  const onInput = Math.abs(tx - input) < 1e-6;
  const toneOk = c.tone === null || s.tone === c.tone;
  return {
    txFreq: tx,
    inputFreq: input,
    onInput,
    toneOk,
    accessed: onInput && toneOk && !s.reverse,
    reverse: Boolean(s.reverse),
    hearsDirect: Boolean(s.reverse) && Boolean(c.hearsDirect),
  };
}

// ---- LAB-12 clock mode: bearings, long path and UTC -------------------------------------------

export interface ClockConfig {
  from: LonLat;
  to: LonLat;
  /** A scheduled UTC time (hours) and your offset from UTC (hours). */
  utc: number;
  offset: number;
}
export interface ClockState {
  /** Antenna heading, degrees true. */
  heading: number;
  /** Your answer for the local time (hours, 0..23.5). */
  local: number;
}

export const angleDiff = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

export function clockVariables(s: ClockState, c: ClockConfig): Vars | null {
  if (!c?.from || !c?.to || !finite(s?.heading, s?.local, c.utc, c.offset)) return null;
  const short = bearing(c.from, c.to);
  const long = (short + 180) % 360;
  const netLocal = (((c.utc + c.offset) % 24) + 24) % 24;
  return {
    shortBearing: short,
    longBearing: long,
    aimedShort: angleDiff(s.heading, short) <= 10,
    aimedLong: angleDiff(s.heading, long) <= 10,
    distance: distanceKm(c.from, c.to),
    netLocal,
    localOk: Math.abs(s.local - netLocal) < 1e-6,
  };
}

// ---- LAB-02 Rules Navigator ----------------------------------------------------------------------

export interface RulesCase {
  id: string;
  situation: string;
  options: string[];
  answer: string;
  /** Which document settles it, shown after answering. */
  source?: string;
  why: string;
}
export interface RulesConfig {
  cases: RulesCase[];
}
export interface RulesState {
  /** case id → the option chosen (the latest pick). */
  answers: Record<string, string>;
}

export function rulesVariables(s: RulesState, c: RulesConfig): Vars | null {
  if (!c || !Array.isArray(c.cases) || c.cases.length === 0) return null;
  const a = s?.answers ?? {};
  const correct = c.cases.filter((k) => a[k.id] === k.answer).length;
  return { correct, total: c.cases.length, complete: correct === c.cases.length };
}
