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

/** One import() per lab module: dynamic() and preloadLabs() must share it, because the bundler
 * names a chunk per import site and the offline cache has to hold the chunk the page will ask for. */
const load = {
  AntennaBuilderLab: () => import("./AntennaBuilderLab"),
  BlockDiagramLab: () => import("./BlockDiagramLab"),
  ColourCodeLab: () => import("./ColourCodeLab"),
  ComponentBenchLab: () => import("./ComponentBenchLab"),
  AntennaPermitLab: () => import("./AntennaPermitLab"),
  BandPlanLab: () => import("./BandPlanLab"),
  CallSignLab: () => import("./CallSignLab"),
  DbLadderLab: () => import("./DbLadderLab"),
  ExamSimulatorLab: () => import("./ExamSimulatorLab"),
  DrillLab: () => import("./DrillLab"),
  RepeaterLab: () => import("./RepeaterLab"),
  RulesLab: () => import("./RulesLab"),
  ScenarioLab: () => import("./ScenarioLab"),
  FilterLab: () => import("./FilterLab"),
  InterferenceLab: () => import("./InterferenceLab"),
  IonosphereLab: () => import("./IonosphereLab"),
  SolarCycleLab: () => import("./SolarCycleLab"),
  VhfLab: () => import("./VhfLab"),
  WorldClockLab: () => import("./WorldClockLab"),
  FeedlineLab: () => import("./FeedlineLab"),
  PatternLab: () => import("./PatternLab"),
  SwrTunerLab: () => import("./SwrTunerLab"),
  MorseLab: () => import("./MorseLab"),
  PowerBenchLab: () => import("./PowerBenchLab"),
  PowerLimitLab: () => import("./PowerLimitLab"),
  RfExposureLab: () => import("./RfExposureLab"),
  SafetyInspectorLab: () => import("./SafetyInspectorLab"),
  SpectrumLab: () => import("./SpectrumLab"),
  MeterLab: () => import("./MeterLab"),
  OhmsLawLab: () => import("./OhmsLawLab"),
  ResonanceLab: () => import("./ResonanceLab"),
  ScopeLab: () => import("./ScopeLab"),
  TransformerLab: () => import("./TransformerLab"),
  UnitSliderLab: () => import("./UnitSliderLab"),
};

// Each lab is its own chunk, loaded only by the lessons that use it (Three.js and WebAudio stay
// out of every other page).
const AntennaBuilderLab = dynamic(() => load.AntennaBuilderLab().then((m) => m.AntennaBuilderLab), { loading });
const BlockDiagramLab = dynamic(() => load.BlockDiagramLab().then((m) => m.BlockDiagramLab), { loading });
const ColourCodeLab = dynamic(() => load.ColourCodeLab().then((m) => m.ColourCodeLab), { loading });
const ComponentBenchLab = dynamic(() => load.ComponentBenchLab().then((m) => m.ComponentBenchLab), { loading });
const AntennaPermitLab = dynamic(() => load.AntennaPermitLab().then((m) => m.AntennaPermitLab), { loading });
const BandPlanLab = dynamic(() => load.BandPlanLab().then((m) => m.BandPlanLab), { loading });
const CallSignLab = dynamic(() => load.CallSignLab().then((m) => m.CallSignLab), { loading });
const DbLadderLab = dynamic(() => load.DbLadderLab().then((m) => m.DbLadderLab), { loading });
const ExamSimulatorLab = dynamic(() => load.ExamSimulatorLab().then((m) => m.ExamSimulatorLab), { loading });
const PhoneticLab = dynamic(() => load.DrillLab().then((m) => m.PhoneticLab), { loading });
const RepeaterLab = dynamic(() => load.RepeaterLab().then((m) => m.RepeaterLab), { loading });
const RulesLab = dynamic(() => load.RulesLab().then((m) => m.RulesLab), { loading });
const EmergencyNetLab = dynamic(() => load.ScenarioLab().then((m) => m.EmergencyNetLab), { loading });
const QsoLab = dynamic(() => load.ScenarioLab().then((m) => m.QsoLab), { loading });
const FilterLab = dynamic(() => load.FilterLab().then((m) => m.FilterLab), { loading });
const InterferenceLab = dynamic(() => load.InterferenceLab().then((m) => m.InterferenceLab), { loading });
const IonosphereLab = dynamic(() => load.IonosphereLab().then((m) => m.IonosphereLab), { loading });
const SolarCycleLab = dynamic(() => load.SolarCycleLab().then((m) => m.SolarCycleLab), { loading });
const VhfLab = dynamic(() => load.VhfLab().then((m) => m.VhfLab), { loading });
const WorldClockLab = dynamic(() => load.WorldClockLab().then((m) => m.WorldClockLab), { loading });
const FeedlineLab = dynamic(() => load.FeedlineLab().then((m) => m.FeedlineLab), { loading });
const PatternLab = dynamic(() => load.PatternLab().then((m) => m.PatternLab), { loading });
const SwrTunerLab = dynamic(() => load.SwrTunerLab().then((m) => m.SwrTunerLab), { loading });
const MorseLab = dynamic(() => load.MorseLab().then((m) => m.MorseLab), { loading });
const PowerBenchLab = dynamic(() => load.PowerBenchLab().then((m) => m.PowerBenchLab), { loading });
const PowerLimitLab = dynamic(() => load.PowerLimitLab().then((m) => m.PowerLimitLab), { loading });
const RfExposureLab = dynamic(() => load.RfExposureLab().then((m) => m.RfExposureLab), { loading });
const SafetyInspectorLab = dynamic(() => load.SafetyInspectorLab().then((m) => m.SafetyInspectorLab), { loading });
const SpectrumLab = dynamic(() => load.SpectrumLab().then((m) => m.SpectrumLab), { loading });
const MeterLab = dynamic(() => load.MeterLab().then((m) => m.MeterLab), { loading });
const OhmsLawLab = dynamic(() => load.OhmsLawLab().then((m) => m.OhmsLawLab), { loading });
const ResonanceLab = dynamic(() => load.ResonanceLab().then((m) => m.ResonanceLab), { loading });
const ScopeLab = dynamic(() => load.ScopeLab().then((m) => m.ScopeLab), { loading });
const TransformerLab = dynamic(() => load.TransformerLab().then((m) => m.TransformerLab), { loading });
const UnitSliderLab = dynamic(() => load.UnitSliderLab().then((m) => m.UnitSliderLab), { loading });

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

/**
 * Download the code for these labs in the background, so a section saved for offline use has its
 * labs too (the service worker keeps every /_next/static file it sees).
 */
const LAB_MODULE: Record<string, keyof typeof load> = {
  "LAB-01": "BandPlanLab",
  "LAB-02": "RulesLab",
  "LAB-03": "CallSignLab",
  "LAB-04": "PowerLimitLab",
  "LAB-05": "RfExposureLab",
  "LAB-06": "AntennaPermitLab",
  "LAB-07": "ScenarioLab",
  "LAB-08": "RepeaterLab",
  "LAB-09": "DrillLab",
  "LAB-10": "MorseLab",
  "LAB-11": "ScenarioLab",
  "LAB-12": "WorldClockLab",
  "LAB-13": "BlockDiagramLab",
  "LAB-14": "SpectrumLab",
  "LAB-15": "PowerBenchLab",
  "LAB-16": "SafetyInspectorLab",
  "LAB-17": "ComponentBenchLab",
  "LAB-18": "ColourCodeLab",
  "LAB-19": "UnitSliderLab",
  "LAB-20": "OhmsLawLab",
  "LAB-21": "ScopeLab",
  "LAB-22": "DbLadderLab",
  "LAB-23": "TransformerLab",
  "LAB-24": "ResonanceLab",
  "LAB-25": "MeterLab",
  "LAB-26": "FeedlineLab",
  "LAB-27": "SwrTunerLab",
  "LAB-28": "AntennaBuilderLab",
  "LAB-29": "PatternLab",
  "LAB-30": "IonosphereLab",
  "LAB-31": "SolarCycleLab",
  "LAB-32": "VhfLab",
  "LAB-33": "InterferenceLab",
  "LAB-34": "FilterLab",
  "LAB-35": "ExamSimulatorLab",
};

export function preloadLabs(ids: (string | null | undefined)[]) {
  for (const id of new Set(ids)) if (id && LAB_MODULE[id]) void load[LAB_MODULE[id]]().catch(() => undefined);
}
