"use client";
import { useState } from "react";
import { BANDS, EMISSION_NAMES, bandAt, bandPlanVariables, type BandPlanState, type Emission } from "@hampath/ham-sim";
import { Knob } from "@hampath/ui";
import type { LabBodyProps } from "./registry";
import { Readouts, SegChoice, useReport } from "./common";

interface Config extends BandPlanState {
  emissions: Emission[];
  /** Tuning range (MHz). */
  range: { min: number; max: number; step: number };
  controls: { f: boolean; emission: boolean };
}

const W = 520;
const fmtF = (f: number) => (f < 1 ? `${(f * 1000).toFixed(1)} kHz` : `${Number(f.toFixed(4))} MHz`);

/** LAB-01 Band Plan Explorer: Canada's amateur bands, their bandwidth limits, and what fits where. */
export function BandPlanLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const demo = mode === "demo";
  const [s, setS] = useState<BandPlanState>({ f: cfg.f, emission: cfg.emission });
  const v = bandPlanVariables(s)!;
  useReport(onState, v, s as unknown as Record<string, unknown>, [s]);
  const set = <K extends keyof BandPlanState>(k: K, x: BandPlanState[K]) => setS((cur) => ({ ...cur, [k]: x }));
  const { min, max } = cfg.range;
  const lmin = Math.log(min);
  const lmax = Math.log(max);
  const x = (f: number) => 10 + ((Math.log(f) - lmin) / (lmax - lmin)) * (W - 20);
  const visible = BANDS.filter((b) => b.hi >= min && b.lo <= max);
  const here = bandAt(s.f);

  const status = !v.inBand
    ? `${fmtF(s.f)} is outside the amateur bands: you may not transmit there.`
    : !v.modeOk
      ? `SSB isn't allowed on ${here!.name}.`
      : !v.bwOk
        ? `${EMISSION_NAMES[s.emission]} is about ${v.bw} kHz wide, more than ${here!.name}'s ${v.bwLimit} kHz limit.`
        : !v.edgeOk
          ? "Too close to the band edge: part of your signal falls outside the band."
          : `Legal: ${EMISSION_NAMES[s.emission]} on ${fmtF(s.f)}, inside ${here!.name}.`;

  return (
    <div className="lab">
      <div className="shack-well">
        <svg
          viewBox={`0 0 ${W} 120`}
          role="img"
          aria-label={`Band chart from ${fmtF(min)} to ${fmtF(max)}. You're on ${fmtF(s.f)}${here ? `, in the ${here.name} band (${here.lo} to ${here.hi} MHz)` : ", outside the amateur bands"}.`}
        >
          <path className="iono-ground" d={`M10,70 H${W - 10}`} />
          {visible.map((b, i) => {
            const x1 = x(Math.max(b.lo, min));
            const x2 = Math.max(x1 + 3, x(Math.min(b.hi, max)));
            const cx = (x1 + x2) / 2;
            const anchor = cx < 40 ? "start" : cx > W - 40 ? "end" : "middle";
            return (
              <g key={b.name}>
                <rect
                  className={here === b ? "band-bar band-here" : "band-bar"}
                  x={x1}
                  y="50"
                  width={x2 - x1}
                  height="40"
                  rx="2"
                />
                <text
                  className="part-value"
                  x={anchor === "start" ? x1 : anchor === "end" ? x2 : cx}
                  y={i % 2 ? 108 : 42}
                  textAnchor={anchor}
                >
                  {b.name}
                </text>
              </g>
            );
          })}
          <path className="iono-ray" d={`M${x(s.f)},26 V96`} />
          <text
            className="part-value"
            x={x(s.f)}
            y="18"
            textAnchor={x(s.f) > W - 60 ? "end" : x(s.f) < 60 ? "start" : "middle"}
          >
            {fmtF(s.f)}
          </text>
        </svg>
      </div>
      <div className="knobs">
        {cfg.controls.f && (
          <Knob
            label="Frequency"
            value={s.f}
            {...cfg.range}
            onChange={(f) => set("f", f)}
            format={fmtF}
            disabled={demo}
          />
        )}
        {cfg.controls.emission && (
          <SegChoice
            label="Emission"
            value={s.emission}
            onChange={(e) => set("emission", e)}
            disabled={demo}
            options={cfg.emissions.map((e) => ({ value: e, label: EMISSION_NAMES[e] }))}
          />
        )}
      </div>
      <Readouts
        items={[
          ["Band", here ? `${here.name}: ${here.lo} to ${here.hi} MHz` : "none"],
          ["Bandwidth limit", here ? `${here.bwKHz >= 1000 ? `${here.bwKHz / 1000} MHz` : `${here.bwKHz} kHz`}` : "–"],
          ["Your signal", `about ${(v.bw as number) >= 1000 ? `${(v.bw as number) / 1000} MHz` : `${v.bw} kHz`}`],
        ]}
      />
      <p className="lab-state" role="status">
        {status}
      </p>
    </div>
  );
}
