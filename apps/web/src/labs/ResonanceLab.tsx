"use client";
import { useState } from "react";
import { resonanceVariables, rlcImpedance } from "@hampath/ham-sim";
import { Plot, sample } from "@hampath/ui";
import type { LabBodyProps } from "./registry";
import { LogKnob, Readouts, SegChoice, fmt, useReport } from "./common";

interface Config {
  L: number;
  C: number;
  R: number;
  circuit: "series" | "parallel";
  f: number;
  controls: { L: boolean; C: boolean; f: boolean; circuit: boolean };
}

/** LAB-24 Resonance Tuner: an LC circuit's impedance against frequency, with L, C and the test frequency on knobs. */
export function ResonanceLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const demo = mode === "demo";
  const [L, setL] = useState(cfg.L);
  const [C, setC] = useState(cfg.C);
  const [f, setF] = useState(cfg.f);
  const [circuit, setCircuit] = useState(cfg.circuit);
  const s = { L, C, R: cfg.R, circuit, f };
  const v = resonanceVariables(s)!;
  useReport(onState, v, s, [L, C, f, circuit]);
  const f0 = v.f0 as number;
  const lo = f0 / 4;
  const hi = f0 * 4;
  const curve = sample((x) => rlcImpedance(s, x), lo, hi, 300, true);
  const zs = curve.map(([, z]) => z);
  const zmin = Math.max(Math.min(...zs) / 2, 0.1);
  const zmax = Math.max(...zs) * 2;

  return (
    <div className="lab">
      <Plot
        label={`${circuit} tuned circuit. Resonant frequency ${fmt(f0, "Hz")}. At ${fmt(f, "Hz")} the impedance is ${fmt(v.Z as number, "Ω")}${v.atResonance ? ", at resonance" : ""}.`}
        series={[{ points: curve, tone: "a" }]}
        xDomain={[lo, hi]}
        yDomain={[zmin, zmax]}
        xLog
        yLog
        xTicks={[lo, f0 / 2, f0, f0 * 2, hi]}
        formatX={(x) => fmt(x, "Hz", 2)}
        yTicks={[]}
        xLabel="frequency"
        yLabel="impedance"
        markers={[
          { x: f0, label: "f₀" },
          { x: f, label: fmt(v.Z as number, "Ω", 2) },
        ]}
      />
      <div className="knobs">
        {cfg.controls.L && (
          <LogKnob
            label="Inductance"
            value={L}
            min={cfg.L / 10}
            max={cfg.L * 10}
            onChange={setL}
            format={(x) => fmt(x, "H")}
            disabled={demo}
          />
        )}
        {cfg.controls.C && (
          <LogKnob
            label="Capacitance"
            value={C}
            min={cfg.C / 10}
            max={cfg.C * 10}
            onChange={setC}
            format={(x) => fmt(x, "F")}
            disabled={demo}
          />
        )}
        {cfg.controls.f && (
          <LogKnob
            label="Signal frequency"
            value={f}
            min={lo}
            max={hi}
            onChange={setF}
            format={(x) => fmt(x, "Hz")}
            disabled={demo}
            stepsPerDecade={40}
          />
        )}
        {cfg.controls.circuit && (
          <SegChoice
            label="Circuit"
            value={circuit}
            onChange={setCircuit}
            disabled={demo}
            options={[
              { value: "series", label: "Series" },
              { value: "parallel", label: "Parallel" },
            ]}
          />
        )}
      </div>
      <Readouts
        items={[
          ["Resonant frequency f₀", fmt(f0, "Hz")],
          ["XL at signal", fmt(v.XL as number, "Ω")],
          ["XC at signal", fmt(v.XC as number, "Ω")],
          ["Impedance at signal", fmt(v.Z as number, "Ω")],
          ["Bandwidth", fmt(v.bandwidth as number, "Hz")],
          ["At resonance", v.atResonance ? "yes: XL = XC" : "no"],
        ]}
      />
    </div>
  );
}
