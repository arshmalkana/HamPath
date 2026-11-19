import dynamic from "next/dynamic";
import { createElement, type ComponentType } from "react";
import type { Vars } from "@hampath/ham-sim";
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

/** Shown while a lab's code loads; the same height as a typical lab, so the page doesn't jump. */
const loading = () => createElement("div", { className: "lab-loading", "aria-busy": "true" }, "Loading the lab…");

// Each lab is its own chunk, loaded only by the lessons that use it (Three.js and WebAudio stay
// out of every other page). `import()` must sit inline in each dynamic() call for code splitting.
const AntennaBuilderLab = dynamic(() => import("./AntennaBuilderLab").then((m) => m.AntennaBuilderLab), { loading });
const BlockDiagramLab = dynamic(() => import("./BlockDiagramLab").then((m) => m.BlockDiagramLab), { loading });
const ColourCodeLab = dynamic(() => import("./ColourCodeLab").then((m) => m.ColourCodeLab), { loading });
const ComponentBenchLab = dynamic(() => import("./ComponentBenchLab").then((m) => m.ComponentBenchLab), { loading });
const AntennaPermitLab = dynamic(() => import("./AntennaPermitLab").then((m) => m.AntennaPermitLab), { loading });
const BandPlanLab = dynamic(() => import("./BandPlanLab").then((m) => m.BandPlanLab), { loading });
const CallSignLab = dynamic(() => import("./CallSignLab").then((m) => m.CallSignLab), { loading });
const DbLadderLab = dynamic(() => import("./DbLadderLab").then((m) => m.DbLadderLab), { loading });
const ExamSimulatorLab = dynamic(() => import("./ExamSimulatorLab").then((m) => m.ExamSimulatorLab), { loading });
const PhoneticLab = dynamic(() => import("./DrillLab").then((m) => m.PhoneticLab), { loading });
const RepeaterLab = dynamic(() => import("./RepeaterLab").then((m) => m.RepeaterLab), { loading });
const RulesLab = dynamic(() => import("./RulesLab").then((m) => m.RulesLab), { loading });
const EmergencyNetLab = dynamic(() => import("./ScenarioLab").then((m) => m.EmergencyNetLab), { loading });
const QsoLab = dynamic(() => import("./ScenarioLab").then((m) => m.QsoLab), { loading });
const FilterLab = dynamic(() => import("./FilterLab").then((m) => m.FilterLab), { loading });
const InterferenceLab = dynamic(() => import("./InterferenceLab").then((m) => m.InterferenceLab), { loading });
const IonosphereLab = dynamic(() => import("./IonosphereLab").then((m) => m.IonosphereLab), { loading });
const SolarCycleLab = dynamic(() => import("./SolarCycleLab").then((m) => m.SolarCycleLab), { loading });
const VhfLab = dynamic(() => import("./VhfLab").then((m) => m.VhfLab), { loading });
const WorldClockLab = dynamic(() => import("./WorldClockLab").then((m) => m.WorldClockLab), { loading });
const FeedlineLab = dynamic(() => import("./FeedlineLab").then((m) => m.FeedlineLab), { loading });
const PatternLab = dynamic(() => import("./PatternLab").then((m) => m.PatternLab), { loading });
const SwrTunerLab = dynamic(() => import("./SwrTunerLab").then((m) => m.SwrTunerLab), { loading });
const MorseLab = dynamic(() => import("./MorseLab").then((m) => m.MorseLab), { loading });
const PowerBenchLab = dynamic(() => import("./PowerBenchLab").then((m) => m.PowerBenchLab), { loading });
const PowerLimitLab = dynamic(() => import("./PowerLimitLab").then((m) => m.PowerLimitLab), { loading });
const RfExposureLab = dynamic(() => import("./RfExposureLab").then((m) => m.RfExposureLab), { loading });
const SafetyInspectorLab = dynamic(() => import("./SafetyInspectorLab").then((m) => m.SafetyInspectorLab), { loading });
const SpectrumLab = dynamic(() => import("./SpectrumLab").then((m) => m.SpectrumLab), { loading });
const MeterLab = dynamic(() => import("./MeterLab").then((m) => m.MeterLab), { loading });
const OhmsLawLab = dynamic(() => import("./OhmsLawLab").then((m) => m.OhmsLawLab), { loading });
const ResonanceLab = dynamic(() => import("./ResonanceLab").then((m) => m.ResonanceLab), { loading });
const ScopeLab = dynamic(() => import("./ScopeLab").then((m) => m.ScopeLab), { loading });
const TransformerLab = dynamic(() => import("./TransformerLab").then((m) => m.TransformerLab), { loading });
const UnitSliderLab = dynamic(() => import("./UnitSliderLab").then((m) => m.UnitSliderLab), { loading });

/** All 35 labs from SPEC §4. A null component renders the placeholder so lessons still load. */
export const LAB_REGISTRY: LabEntry[] = [
  { id: "LAB-01", name: "Band Plan Explorer", component: BandPlanLab },
  { id: "LAB-02", name: "Rules Navigator", component: RulesLab },
  { id: "LAB-03", name: "Call Sign Builder", component: CallSignLab },
  { id: "LAB-04", name: "Power Limit Calculator", component: PowerLimitLab },
  { id: "LAB-05", name: "RF Exposure Zone", component: RfExposureLab },
  { id: "LAB-06", name: "Antenna Permit Planner", component: AntennaPermitLab },
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
  { id: "LAB-35", name: "Exam Simulator", component: ExamSimulatorLab },
];

export function findLab(id: string): LabEntry | undefined {
  return LAB_REGISTRY.find((l) => l.id === id);
}
