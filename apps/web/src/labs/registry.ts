import type { ComponentType } from "react";
import type { Vars } from "@hampath/ham-sim";
import { OhmsLawLab } from "./OhmsLawLab";

export type LabMode = "explore" | "sandbox" | "demo";

/** What every lab body receives from the <Lab> frame. */
export interface LabBodyProps {
  /** default_config merged with the lesson step's config. */
  config: Record<string, unknown>;
  mode: LabMode;
  /** Report the lab's goal variables (for the goal check) and its raw state (sent with events). */
  onState: (vars: Vars, state: Record<string, unknown>) => void;
}

export interface LabEntry {
  id: string;
  name: string;
  component: ComponentType<LabBodyProps> | null;
}

/** All 35 labs from SPEC §4. A null component renders the placeholder so lessons still load. */
export const LAB_REGISTRY: LabEntry[] = [
  { id: "LAB-01", name: "Band Plan Explorer", component: null },
  { id: "LAB-02", name: "Rules Navigator", component: null },
  { id: "LAB-03", name: "Call Sign Builder", component: null },
  { id: "LAB-04", name: "Power Limit Calculator", component: null },
  { id: "LAB-05", name: "RF Exposure Zone", component: null },
  { id: "LAB-06", name: "Antenna Permit Planner", component: null },
  { id: "LAB-07", name: "Virtual QSO Simulator", component: null },
  { id: "LAB-08", name: "Repeater Lab", component: null },
  { id: "LAB-09", name: "Phonetic & Q-Code Trainer", component: null },
  { id: "LAB-10", name: "Morse Trainer", component: null },
  { id: "LAB-11", name: "Emergency Net Scenario", component: null },
  { id: "LAB-12", name: "World Map & Clock", component: null },
  { id: "LAB-13", name: "Block-Diagram Builder", component: null },
  { id: "LAB-14", name: "Mode Spectrum Lab", component: null },
  { id: "LAB-15", name: "Power Bench", component: null },
  { id: "LAB-16", name: "Safe Shack Inspector", component: null },
  { id: "LAB-17", name: "Component Bench", component: null },
  { id: "LAB-18", name: "Resistor Colour Code", component: null },
  { id: "LAB-19", name: "Unit Slider", component: null },
  { id: "LAB-20", name: "Ohm's Law Circuit Builder", component: OhmsLawLab },
  { id: "LAB-21", name: "AC Scope", component: null },
  { id: "LAB-22", name: "dB Ladder", component: null },
  { id: "LAB-23", name: "Transformer Lab", component: null },
  { id: "LAB-24", name: "Resonance Tuner", component: null },
  { id: "LAB-25", name: "Meter Lab", component: null },
  { id: "LAB-26", name: "Feedline Lab", component: null },
  { id: "LAB-27", name: "SWR Bridge & Tuner", component: null },
  { id: "LAB-28", name: "Antenna Builder", component: null },
  { id: "LAB-29", name: "Radiation Pattern 3D", component: null },
  { id: "LAB-30", name: "Ionosphere Simulator", component: null },
  { id: "LAB-31", name: "Solar Cycle Dial", component: null },
  { id: "LAB-32", name: "VHF Propagation Sandbox", component: null },
  { id: "LAB-33", name: "Interference Detective", component: null },
  { id: "LAB-34", name: "Filter Designer", component: null },
  { id: "LAB-35", name: "Exam Simulator", component: null },
];

export function findLab(id: string): LabEntry | undefined {
  return LAB_REGISTRY.find((l) => l.id === id);
}
