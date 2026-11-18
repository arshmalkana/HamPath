"use client";
import { useState } from "react";
import {
  CHIRP_HZ,
  MODE_SPECS,
  spectrumVariables,
  type Mode,
  type SpectrumConfig,
  type SpectrumState,
} from "@hampath/ham-sim";
import { Knob, Plot, ToggleSwitch, Waterfall } from "@hampath/ui";
import type { LabBodyProps } from "./registry";
import { Readouts, SegChoice, Stepper, useReport } from "./common";

type Range = { min: number; max: number; step: number };
interface Config extends SpectrumConfig {
  mode: Mode;
  filter: number;
  tune: number;
  agc?: boolean;
  deviation?: number;
  regulated?: boolean;
  shaped?: boolean;
  squelch?: boolean;
  /** No station on the channel (squelch demo). */
  noSignal?: boolean;
  filters: number[];
  /** Dial frequency for the waterfall, Hz. */
  dialHz?: number;
  waterfall?: boolean;
  /** Label for the tuning knob ("Tuning offset" or "Your transmit offset"). */
  tuneLabel?: string;
  controls: {
    modes: Mode[] | false;
    filter: boolean;
    tune: Range | false;
    agc: boolean;
    deviation?: Range | false;
    keying?: boolean;
    squelch?: boolean;
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

/** LAB-14 Mode Spectrum Lab: emission widths, filters, tuning, AGC, CW keying, FM deviation and squelch. */
export function SpectrumLab({ config, mode: labMode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const c = cfg.controls;
  const demo = labMode === "demo";
  const [mode, setMode] = useState<Mode>(cfg.mode);
  const [filter, setFilter] = useState(cfg.filter);
  const [tune, setTune] = useState(cfg.tune);
  const [agc, setAgc] = useState(Boolean(cfg.agc));
  const [deviation, setDeviation] = useState(cfg.deviation);
  const [regulated, setRegulated] = useState(cfg.regulated);
  const [shaped, setShaped] = useState(cfg.shaped);
  const [squelch, setSquelch] = useState(cfg.squelch);
  const state: SpectrumState = { mode, filter, tune, agc, deviation, regulated, shaped, squelch };
  const v = spectrumVariables(state, cfg)!;
  useReport(onState, v, state as unknown as Record<string, unknown>, [
    mode,
    filter,
    tune,
    agc,
    deviation,
    regulated,
    shaped,
    squelch,
  ]);

  const spec = MODE_SPECS[mode];
  const bw = v.bw as number;
  const qrm = cfg.qrm ? MODE_SPECS[cfg.qrm.mode] : null;
  const span = Math.max(bw, filter, qrm ? Math.abs(cfg.qrm!.offset) * 2 + qrm.bw : 0, 1000) * 1.4;
  const lo = -span / 2;
  const hi = span / 2;
  const series = [
    ...(cfg.noSignal ? [] : [{ points: hump(-tune, bw, lo, hi), tone: "b" as const, label: spec.name }]),
    ...((v.chirp as number) > 0
      ? [{ points: hump(-tune + CHIRP_HZ, bw, lo, hi, 0.7), tone: "b" as const, dashed: true, label: "chirp" }]
      : []),
    ...(cfg.qrm && qrm
      ? [{ points: hump(cfg.qrm.offset - tune, qrm.bw, lo, hi, 0.8), tone: "c" as const, label: "interference" }]
      : []),
    ...(c.filter || c.tune
      ? [
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
        ]
      : []),
  ];

  const keyingStatus =
    (v.chirp as number) > 0 && (v.clicks as number) > 0
      ? `Two faults: the supply sags on every key-down, so the frequency jumps ${CHIRP_HZ} Hz (chirp), and the hard keying edges spread clicks over ${hz(v.clicks as number)}.`
      : (v.chirp as number) > 0
        ? `Chirp: the supply voltage sags on each dit and dah and the frequency jumps ${CHIRP_HZ} Hz. A steady supply cures it.`
        : (v.clicks as number) > 0
          ? `Key clicks: the hard on/off edges spread the signal over ${hz(v.clicks as number)}.`
          : "Clean CW: steady frequency and soft keying edges.";
  const fmStatus = (v.overdeviated as boolean)
    ? `Too much deviation: your audio is distorted and the signal is ${hz(bw)} wide.`
    : (v.audio as number) < 0.75
      ? `Too little deviation: your audio sounds low on a channel set for ${hz(cfg.expectedDeviation ?? 5000)}.`
      : `Deviation right: normal audio, and the signal is about ${hz(bw)} wide.`;
  const status = c.keying
    ? keyingStatus
    : c.deviation
      ? fmStatus
      : c.squelch
        ? squelch
          ? "Squelch on: the speaker stays quiet until a signal arrives."
          : "No signal, squelch off: the receiver's huge gain ahead of the discriminator turns plain noise into a loud rush."
        : c.agc
          ? agc
            ? "AGC on: strong and weak signals come out at nearly the same volume."
            : "AGC off: the volume jumps every time the signal strength changes."
          : cfg.noSignal && cfg.qrm
            ? (v.qrm as number) > 0.02
              ? `Too close: your signal overlaps the contact in progress (${pct(v.qrm as number)} of it).`
              : "Clear: your signal no longer overlaps the contact in progress."
            : !v.natural
              ? `Mistuned by ${hz(v.tuneError as number)}: it sounds wrong and is hard to copy.`
              : v.lost
                ? `The filter is narrower than the signal: ${pct(1 - (v.passed as number))} of it is cut off and information is lost.`
                : (v.qrm as number) > 0.02
                  ? `The other signal overlaps yours (${pct(v.qrm as number)} of it falls in your passband).`
                  : (v.excess as number) > bw
                    ? "All of the signal gets through, plus a lot of extra noise from the empty spectrum either side."
                    : "The whole signal fits, and little else gets in.";

  const dial = cfg.dialHz ?? 14_070_000;
  return (
    <div className="lab">
      <div className="shack-well">
        <Plot
          label={`Spectrum: ${cfg.noSignal ? "no signal" : `${spec.name} signal ${hz(bw)} wide`}, filter ${hz(filter)}${cfg.qrm ? `, another signal ${hz(Math.abs(cfg.qrm.offset - tune))} away` : ""}.`}
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
          centerHz={dial}
          spanHz={span}
          signals={[
            { hz: dial - tune, width: bw, strength: 0.9, label: spec.name },
            ...(cfg.qrm && qrm
              ? [{ hz: dial + cfg.qrm.offset - tune, width: qrm.bw, strength: 0.7, label: "other signal" }]
              : []),
          ]}
        />
      )}
      <div className="knobs">
        {c.modes && (
          <SegChoice
            label="Mode"
            value={mode}
            onChange={setMode}
            disabled={demo}
            options={c.modes.map((m) => ({ value: m, label: MODE_SPECS[m].name }))}
          />
        )}
        {c.filter && (
          <Stepper
            label="Receiver filter"
            values={cfg.filters}
            value={filter}
            onChange={setFilter}
            format={hz}
            disabled={demo}
          />
        )}
        {c.tune && (
          <Knob
            label={cfg.tuneLabel ?? "Tuning offset"}
            value={tune}
            {...c.tune}
            onChange={setTune}
            format={(x) => `${x > 0 ? "+" : ""}${Math.round(x)} Hz`}
            disabled={demo}
          />
        )}
        {c.deviation && (
          <Knob
            label="Deviation"
            value={deviation ?? 0}
            {...c.deviation}
            onChange={setDeviation}
            format={(x) => hz(x)}
            disabled={demo}
          />
        )}
        {c.agc && <ToggleSwitch label="AGC" checked={agc} onChange={setAgc} disabled={demo} />}
        {c.keying && (
          <>
            <ToggleSwitch
              label="Regulated supply"
              checked={regulated !== false}
              onChange={setRegulated}
              disabled={demo}
            />
            <ToggleSwitch label="Shaped keying" checked={shaped !== false} onChange={setShaped} disabled={demo} />
          </>
        )}
        {c.squelch && <ToggleSwitch label="Squelch" checked={Boolean(squelch)} onChange={setSquelch} disabled={demo} />}
      </div>
      <Readouts
        items={[
          ["Signal width", cfg.noSignal ? "none" : hz(bw)],
          ...(c.filter || c.tune
            ? ([
                ["Filter", hz(filter)],
                ["Signal passed", pct(v.passed as number)],
              ] as [string, string][])
            : []),
          ...(cfg.qrm ? ([["Overlap", pct(v.qrm as number)]] as [string, string][]) : []),
          ...(c.agc ? ([["Volume swing", `${v.swing} dB`]] as [string, string][]) : []),
          ...(c.deviation ? ([["Audio level", pct(v.audio as number)]] as [string, string][]) : []),
          ...(c.modes ? ([["Copies down to", `${v.minSnr} dB SNR`]] as [string, string][]) : []),
        ]}
      />
      <p className="lab-state" role="status">
        {status}
      </p>
    </div>
  );
}
