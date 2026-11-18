"use client";
import { useState } from "react";
import { permitVariables, type PermitConfig, type PermitState } from "@hampath/ham-sim";
import { Knob } from "@hampath/ui";
import type { LabBodyProps } from "./registry";
import { Readouts, SegChoice, useReport } from "./common";

interface Config extends PermitConfig {
  scene: string;
  start: PermitState;
  controls: { height: boolean; choice: boolean };
}

const CHOICES = [
  { value: "none" as const, label: "No consultation needed" },
  { value: "municipal" as const, label: "The municipality's process" },
  { value: "ised" as const, label: "ISED's default process" },
];

/** LAB-06 Antenna Permit Planner: does your tower need public consultation, and whose process? */
export function AntennaPermitLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const demo = mode === "demo";
  const [s, setS] = useState<PermitState>(cfg.start);
  const v = permitVariables(s, cfg)!;
  useReport(onState, v, s as unknown as Record<string, unknown>, [s]);
  const set = <K extends keyof PermitState>(k: K, x: PermitState[K]) => setS((cur) => ({ ...cur, [k]: x }));
  const h = Math.min(30, s.height);

  return (
    <div className="lab">
      <p className="lab-prompt">{cfg.scene}</p>
      <div className="shack-well">
        <svg viewBox="0 0 520 170" role="img" aria-label={`A ${s.height} m antenna tower beside a house. ${v.excluded ? "Below the exclusion height." : "Above the exclusion height: consultation applies."}`}>
          <path className="iono-ground" d="M10,150 H510" />
          <path className="part" d="M300,150 V100 L340,70 L380,100 V150 Z" />
          <path className="part-line yagi-element" d={`M200,150 V${150 - h * 4.5}`} />
          <path className="part-line" d={`M180,${150 - h * 4.5} H220`} />
          <path className="iono-ray iono-ray-dead" d={`M20,${150 - (v.exemptBelow as number) * 4.5} H500`} strokeDasharray="6 5" />
          <text className="part-value" x="500" y={150 - (v.exemptBelow as number) * 4.5 - 6} textAnchor="end">
            exclusion: under {v.exemptBelow} m
          </text>
        </svg>
      </div>
      <div className="knobs">
        {cfg.controls.height && <Knob label="Tower height" value={s.height} min={5} max={30} step={0.5} onChange={(x) => set("height", x)} format={(x) => `${x} m`} disabled={demo} />}
        {cfg.controls.choice && <SegChoice label="Process to follow" value={s.choice} onChange={(x) => set("choice", x)} disabled={demo} options={CHOICES} />}
      </div>
      <Readouts
        items={[
          ["Local consultation process", cfg.localProcess ? "yes" : "none"],
          ["Height", `${s.height} m`],
          ["Consultation", v.excluded ? "excluded" : "required"],
        ]}
      />
      <p className="lab-state" role="status">
        {v.excluded
          ? "Excluded: no public consultation needed, though you should still be a good neighbour."
          : cfg.localProcess
            ? "Above the exclusion: follow the municipality's process. It decides how consultation happens."
            : "Above the exclusion, and no local process: follow ISED's default process, with written notice and a 30-day comment period."}
      </p>
    </div>
  );
}
