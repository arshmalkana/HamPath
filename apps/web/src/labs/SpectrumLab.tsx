"use client";
import { useState } from "react";
import { MODE_SPECS, spectrumVariables, type Mode, type SpectrumConfig, type SpectrumState } from "@hampath/ham-sim";
import { Knob, Plot, ToggleSwitch, Waterfall } from "@hampath/ui";
import type { LabBodyProps } from "./registry";
import { Readouts, SegChoice, Stepper, useReport } from "./common";

interface Config extends SpectrumConfig {
  mode: Mode;
  filter: number;
  tune: number;
  agc?: boolean;
  filters: number[];
  /** Dial frequency for the waterfall, Hz. */
  dialHz?: number;
  waterfall?: boolean;
  controls: {
    modes: Mode[] | false;
    filter: boolean;
    tune: { min: number; max: number; step: number } | false;
    agc: boolean;
  };
}

/** A signal's spectrum drawn as a flat-topped hump `bw` wide around `c`. */
function hump(c: number, bw: number, lo: number, hi: number, h = 1): [number, number][] {
  const edge = Math.max(bw * 0.08, 20);
  const pts: [number, number][] = [
    [lo, 0],
    [c - bw / 2 - edge, 0],
    [c - bw / 2, h],
    [c + bw / 2, h],
    [c + bw / 2 + edge, 0],
    [hi, 0],
  ];
  return pts.filter(([x], i, a) => i === 0 || x >= a[i - 1]![0]).map(([x, y]) => [Math.min(hi, Math.max(lo, x)), y]);
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const hz = (x: number) => (x >= 1000 ? `${Number((x / 1000).toPrecision(3))} kHz` : `${Math.round(x)} Hz`);

/** LAB-14 Mode Spectrum Lab: emission widths, receiver filters, tuning and AGC. */
export function SpectrumLab({ config, mode: labMode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const demo = labMode === "demo";
  const [mode, setMode] = useState<Mode>(cfg.mode);
  const [filter, setFilter] = useState(cfg.filter);
  const [tune, setTune] = useState(cfg.tune);
  const [agc, setAgc] = useState(Boolean(cfg.agc));
  const state: SpectrumState = { mode, filter, tune, agc };
  const v = spectrumVariables(state, cfg)!;
  useReport(onState, v, state as unknown as Record<string, unknown>, [mode, filter, tune, agc]);

  const spec = MODE_SPECS[mode];
  const qrm = cfg.qrm ? MODE_SPECS[cfg.qrm.mode] : null;
  const span = Math.max(spec.bw, filter, qrm ? Math.abs(cfg.qrm!.offset) * 2 + qrm.bw : 0, 1000) * 1.4;
  const lo = -span / 2;
  const hi = span / 2;
  const series = [
    { points: hump(-tune, spec.bw, lo, hi), tone: "b" as const, label: spec.name },
    ...(cfg.qrm && qrm
      ? [{ points: hump(cfg.qrm.offset - tune, qrm.bw, lo, hi, 0.8), tone: "c" as const, label: "interference" }]
      : []),
    {
      points: [
        [lo, 0],
        [-filter / 2, 0],
        [-filter / 2, 1.15],
        [filter / 2, 1.15],
        [filter / 2, 0],
        [hi, 0],
      ] as [number, number][],
      tone: "a" as const,
      dashed: true,
      label: "filter",
    },
  ];

  const status = !v.natural
    ? `Mistuned by ${hz(v.tuneError as number)}: the voice sounds high or low pitched and hard to understand.`
    : v.lost
      ? `The filter is narrower than the signal: ${pct(1 - (v.passed as number))} of it is cut off and information is lost.`
      : (v.qrm as number) > 0.02
        ? `The interfering signal gets through the filter (${pct(v.qrm as number)} of it).`
        : (v.excess as number) > spec.bw
          ? "All of the signal gets through, plus a lot of extra noise from the empty spectrum either side."
          : "The whole signal fits the filter, and little else gets in.";

  return (
    <div className="lab">
      <div className="shack-well">
        <Plot
          label={`Spectrum: ${spec.name} signal ${hz(spec.bw)} wide, receiver filter ${hz(filter)} wide${cfg.qrm ? `, interference ${hz(Math.abs(cfg.qrm.offset))} away` : ""}. ${pct(v.passed as number)} of the signal passes.`}
          series={series}
          xDomain={[lo, hi]}
          yDomain={[0, 1.3]}
          xTicks={[lo, 0, hi]}
          formatX={(x) => (x === 0 ? "dial" : `${x > 0 ? "+" : "−"}${hz(Math.abs(x))}`)}
          yTicks={[]}
          xLabel="frequency"
          yLabel="strength"
        />
      </div>
      {cfg.waterfall && (
        <Waterfall
          label="Waterfall: frequency across, time downward, brightness shows strength"
          centerHz={cfg.dialHz ?? 14_070_000}
          spanHz={span}
          signals={[
            { hz: (cfg.dialHz ?? 14_070_000) - tune, width: spec.bw, strength: 0.9, label: spec.name },
            ...(cfg.qrm && qrm
              ? [
                  {
                    hz: (cfg.dialHz ?? 14_070_000) + cfg.qrm.offset - tune,
                    width: qrm.bw,
                    strength: 0.7,
                    label: "interference",
                  },
                ]
              : []),
          ]}
        />
      )}
      <div className="knobs">
        {cfg.controls.modes && cfg.controls.modes.length <= 4 && (
          <SegChoice
            label="Mode"
            value={mode}
            onChange={setMode}
            disabled={demo}
            options={cfg.controls.modes.map((m) => ({ value: m, label: MODE_SPECS[m].name }))}
          />
        )}
        {cfg.controls.filter && (
          <Stepper
            label="Receiver filter"
            values={cfg.filters}
            value={filter}
            onChange={setFilter}
            format={hz}
            disabled={demo}
          />
        )}
        {cfg.controls.tune && (
          <Knob
            label="Tuning offset"
            value={tune}
            {...cfg.controls.tune}
            onChange={setTune}
            format={(x) => `${x > 0 ? "+" : ""}${Math.round(x)} Hz`}
            disabled={demo}
          />
        )}
        {cfg.controls.agc && <ToggleSwitch label="AGC" checked={agc} onChange={setAgc} disabled={demo} />}
      </div>
      <Readouts
        items={[
          ["Signal width", hz(spec.bw)],
          ["Filter", hz(filter)],
          ["Signal passed", pct(v.passed as number)],
          ...(cfg.qrm ? ([["Interference passed", pct(v.qrm as number)]] as [string, string][]) : []),
          ...(cfg.controls.agc ? ([["Volume swing", `${v.swing} dB`]] as [string, string][]) : []),
        ]}
      />
      <p className="lab-state" role="status">
        {cfg.controls.agc
          ? agc
            ? "AGC on: strong and weak signals come out at nearly the same volume."
            : "AGC off: the volume jumps every time the signal strength changes."
          : status}
      </p>
    </div>
  );
}
