import type { ComponentType } from "react";
import type { Vars } from "@hampath/ham-sim";
import { AntennaBuilderLab } from "./AntennaBuilderLab";
import { BlockDiagramLab } from "./BlockDiagramLab";
import { ColourCodeLab } from "./ColourCodeLab";
import { ComponentBenchLab } from "./ComponentBenchLab";
import { DbLadderLab } from "./DbLadderLab";
import { PhoneticLab } from "./DrillLab";
import { RepeaterLab } from "./RepeaterLab";
import { EmergencyNetLab, QsoLab } from "./ScenarioLab";
import { FilterLab } from "./FilterLab";
import { InterferenceLab } from "./InterferenceLab";
import { IonosphereLab } from "./IonosphereLab";
import { SolarCycleLab } from "./SolarCycleLab";
import { VhfLab } from "./VhfLab";
import { WorldClockLab } from "./WorldClockLab";
import { FeedlineLab } from "./FeedlineLab";
import { PatternLab } from "./PatternLab";
import { SwrTunerLab } from "./SwrTunerLab";
import { MorseLab } from "./MorseLab";
import { PowerBenchLab } from "./PowerBenchLab";
import { PowerLimitLab } from "./PowerLimitLab";
import { RfExposureLab } from "./RfExposureLab";
import { SafetyInspectorLab } from "./SafetyInspectorLab";
import { SpectrumLab } from "./SpectrumLab";
import { MeterLab } from "./MeterLab";
import { OhmsLawLab } from "./OhmsLawLab";
import { ResonanceLab } from "./ResonanceLab";
import { ScopeLab } from "./ScopeLab";
import { TransformerLab } from "./TransformerLab";
import { UnitSliderLab } from "./UnitSliderLab";

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
  { id: "LAB-04", name: "Power Limit Calculator", component: PowerLimitLab },
  { id: "LAB-05", name: "RF Exposure Zone", component: RfExposureLab },
  { id: "LAB-06", name: "Antenna Permit Planner", component: null },
  { id: "LAB-07", name: "Virtual QSO Simulator", component: QsoLab },
  { id: "LAB-08", name: "Repeater Lab", component: RepeaterLab },
  { id: "LAB-09", name: "Phonetic & Q-Code Trainer", component: PhoneticLab },
  { id: "LAB-10", name: "Morse Trainer", component: MorseLab },
  { id: "LAB-11", name: "Emergency Net Scenario", component: EmergencyNetLab },
  { id: "LAB-12", name: "World Map & Clock", component: WorldClockLab },
  { id: "LAB-13", name: "Block-Diagram Builder", component: BlockDiagramLab },
  { id: "LAB-14", name: "Mode Spectrum Lab", component: SpectrumLab },
  { id: "LAB-15", name: "Power Bench", component: PowerBenchLab },
  { id: "LAB-16", name: "Safe Shack Inspector", component: SafetyInspectorLab },
  { id: "LAB-17", name: "Component Bench", component: ComponentBenchLab },
  { id: "LAB-18", name: "Resistor Colour Code", component: ColourCodeLab },
  { id: "LAB-19", name: "Unit Slider", component: UnitSliderLab },
  { id: "LAB-20", name: "Ohm's Law Circuit Builder", component: OhmsLawLab },
  { id: "LAB-21", name: "AC Scope", component: ScopeLab },
  { id: "LAB-22", name: "dB Ladder", component: DbLadderLab },
  { id: "LAB-23", name: "Transformer Lab", component: TransformerLab },
  { id: "LAB-24", name: "Resonance Tuner", component: ResonanceLab },
  { id: "LAB-25", name: "Meter Lab", component: MeterLab },
  { id: "LAB-26", name: "Feedline Lab", component: FeedlineLab },
  { id: "LAB-27", name: "SWR Bridge & Tuner", component: SwrTunerLab },
  { id: "LAB-28", name: "Antenna Builder", component: AntennaBuilderLab },
  { id: "LAB-29", name: "Radiation Pattern 3D", component: PatternLab },
  { id: "LAB-30", name: "Ionosphere Simulator", component: IonosphereLab },
  { id: "LAB-31", name: "Solar Cycle Dial", component: SolarCycleLab },
  { id: "LAB-32", name: "VHF Propagation Sandbox", component: VhfLab },
  { id: "LAB-33", name: "Interference Detective", component: InterferenceLab },
  { id: "LAB-34", name: "Filter Designer", component: FilterLab },
  { id: "LAB-35", name: "Exam Simulator", component: null },
];

export function findLab(id: string): LabEntry | undefined {
  return LAB_REGISTRY.find((l) => l.id === id);
}
