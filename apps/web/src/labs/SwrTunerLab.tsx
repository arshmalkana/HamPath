"use client";
import { useState } from "react";
import { swrSweep, swrVariables, type SwrConfig, type SwrState } from "@hampath/ham-sim";
import { AnalogMeter, Knob, Plot } from "@hampath/ui";
import type { LabBodyProps } from "./registry";
import { Readouts, Stepper, useReport } from "./common";

type Range = { min: number; max: number; step: number };
interface Config extends SwrConfig, SwrState {
  analyzer?: boolean;
  /** Analyzer sweep, MHz. */
  sweep?: [number, number];
  ratios?: number[];
  controls: {
    length?: boolean;
    f?: Range | false;
    lineLoss?: Range | false;
    ratio?: boolean;
    tuner?: boolean;
    repair?: boolean;
  };
}

const LENGTHS = Array.from({ length: 21 }, (_, i) => Number((0.9 + i * 0.01).toFixed(2)));
const swrText = (x: number) => (!Number.isFinite(x) || x > 20 ? "∞ : 1" : `${x.toFixed(1)} : 1`);

/** LAB-27 SWR Bridge & Tuner: mismatch, standing waves, the antenna analyzer and matching. */
export function SwrTunerLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const c = cfg.controls;
  const demo = mode === "demo";
  const [s, setS] = useState<SwrState>({
    length: cfg.length,
    f: cfg.f,
    lineLoss: cfg.lineLoss ?? 0,
    ratio: cfg.ratio ?? 1,
    tuner: cfg.tuner ?? null,
    repaired: false,
  });
  const v = swrVariables(s, cfg)!;
  useReport(onState, v, s as unknown as Record<string, unknown>, [s]);
  const set = <K extends keyof SwrState>(k: K, x: SwrState[K]) => setS((cur) => ({ ...cur, [k]: x }));
  const tuner = s.tuner;
  const shown = (tuner ? v.rigSwr : v.stationSwr) as number;

  const status = v.fault
    ? "Something is open or shorted in the antenna system: nearly all the power is reflected."
    : v.foldback
      ? `The transceiver sees a ${swrText(v.rigSwr as number)} mismatch and folds its power back to ${v.power} W to protect itself.`
      : (s.lineLoss ?? 0) > 3 && (v.swr as number) > 2 * (v.stationSwr as number)
        ? `The SWR at the antenna is ${swrText(v.swr as number)}, but the lossy line hides it: the station meter reads only ${swrText(v.stationSwr as number)}.`
        : (v.rigSwr as number) <= 1.5
          ? "Matched: almost no power is reflected and the transceiver delivers full power."
          : "Mismatched: some power is reflected and standing waves form on the line.";

  return (
    <div className="lab">
      <div className="shack-row">
        <div className="shack-well" style={{ display: "grid", placeItems: "center" }}>
          <AnalogMeter
            label={tuner ? "SWR seen by the transceiver" : "SWR at the station"}
            unit=""
            value={Math.min(shown, 5)}
            max={5}
            overload={shown > 5}
            format={swrText}
          />
        </div>
        {cfg.analyzer && cfg.sweep && (
          <div className="shack-well">
            <Plot
              label={`Antenna analyzer: SWR from ${cfg.sweep[0]} to ${cfg.sweep[1]} MHz. The dip is at ${(v.f0 as number).toFixed(3)} MHz; you're on ${s.f} MHz.`}
              series={[{ points: swrSweep(cfg, s, cfg.sweep[0], cfg.sweep[1]), tone: "b" }]}
              xDomain={cfg.sweep}
              yDomain={[1, 6]}
              xTicks={[cfg.sweep[0], (cfg.sweep[0] + cfg.sweep[1]) / 2, cfg.sweep[1]]}
              formatX={(x) => `${Number(x.toFixed(3))}`}
              yTicks={[1, 2, 3, 5]}
              formatY={(y) => `${y}:1`}
              xLabel="frequency (MHz)"
              yLabel="SWR"
              markers={[{ x: s.f, label: "you" }]}
            />
          </div>
        )}
      </div>
      <div className="knobs">
        {c.length && (
          <Stepper
            label="Antenna length"
            values={LENGTHS}
            value={s.length}
            onChange={(x) => set("length", x)}
            format={(x) => `${Math.round(x * 100)}%`}
            disabled={demo}
          />
        )}
        {c.f && (
          <Knob
            label="Frequency"
            value={s.f}
            {...c.f}
            onChange={(x) => set("f", x)}
            format={(x) => `${x.toFixed(3)} MHz`}
            disabled={demo}
          />
        )}
        {c.lineLoss && (
          <Knob
            label="Feedline loss"
            value={s.lineLoss ?? 0}
            {...c.lineLoss}
            onChange={(x) => set("lineLoss", x)}
            format={(x) => `${x} dB`}
            disabled={demo}
          />
        )}
        {c.ratio && cfg.ratios && (
          <Stepper
            label="Matching transformer"
            values={cfg.ratios}
            value={s.ratio ?? 1}
            onChange={(x) => set("ratio", x)}
            format={(x) => `${x}:1`}
            disabled={demo}
          />
        )}
        {c.tuner && tuner && (
          <>
            <Knob
              label="Tuner inductor"
              value={tuner.xl}
              min={0}
              max={300}
              step={10}
              onChange={(x) => set("tuner", { ...tuner, xl: x })}
              format={(x) => `${x} Ω`}
              disabled={demo}
            />
            <Knob
              label="Tuner capacitor"
              value={tuner.xc}
              min={10}
              max={500}
              step={10}
              onChange={(x) => set("tuner", { ...tuner, xc: x })}
              format={(x) => `${x} Ω`}
              disabled={demo}
            />
          </>
        )}
        {c.repair && (
          <div className="control">
            <span className="control-label">Connectors</span>
            <button type="button" className="chip" disabled={demo || s.repaired} onClick={() => set("repaired", true)}>
              Clean and tighten
            </button>
          </div>
        )}
      </div>
      <Readouts
        items={[
          ["SWR at the antenna", swrText(v.swr as number)],
          ...(s.lineLoss ? ([["SWR at the station", swrText(v.stationSwr as number)]] as [string, string][]) : []),
          ["Reflected", `${Math.round((v.reflected as number) * 100)}%`],
          ["Transceiver output", `${v.power} W`],
        ]}
      />
      <p className="lab-state" role="status">
        {status}
      </p>
    </div>
  );
}
