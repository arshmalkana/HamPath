// LAB-13 Block-Diagram Builder: station and radio block diagrams.
//
// The lab step's config (trusted, from content) lists the slots and which block belongs in each;
// the learner's state only says what they placed or picked, so the server can re-grade it.
import type { Vars } from "./goal.ts";

export interface DiagramBlock {
  id: string;
  label: string;
  /** What this stage does (shown when the block is selected). */
  does?: string;
}

export interface DiagramSlot {
  /** The block id that belongs here. */
  accepts: string;
  /** Pre-placed and locked. */
  fixed?: boolean;
  /** Side input (oscillator, key, BFO): feeds the main-chain slot at this index. */
  feeds?: number;
  /** What the signal is like leaving this stage, e.g. "IF, 455 kHz". */
  out?: string;
}

export interface DiagramConfig {
  mode: "build" | "identify";
  blocks: DiagramBlock[];
  slots: DiagramSlot[];
  /** Identify mode: the block the learner must pick. */
  target?: string;
  /** Labels for the two ends of the chain. */
  input?: string;
  output?: string;
}

export interface DiagramState {
  /** Block id in each slot (fixed slots may be omitted). */
  slots: (string | null)[];
  /** Identify mode: the block the learner picked. */
  selected?: string | null;
}

export function blockDiagramVariables(state: DiagramState, config: DiagramConfig): Vars | null {
  if (!config || !Array.isArray(config.slots)) return null;
  const placedIds = Array.isArray(state?.slots) ? state.slots : [];
  let placed = 0;
  let wrong = 0;
  let total = 0;
  config.slots.forEach((s, i) => {
    if (s.fixed) return;
    total++;
    const got = placedIds[i];
    if (got === s.accepts) placed++;
    else if (got) wrong++;
  });
  const found = config.mode === "identify" && typeof state?.selected === "string" && state.selected === config.target;
  return { placed, total, wrong, complete: total > 0 && placed === total, found };
}
