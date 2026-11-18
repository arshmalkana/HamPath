"use client";
import { useState } from "react";
import { ssbDriveVariables, type SsbDriveConfig, type SsbDriveState } from "@hampath/ham-sim";
import { AnalogMeter, Knob, Plot, sample } from "@hampath/ui";
import type { LabBodyProps } from "./registry";
import { Readouts, SegChoice, fmt, useReport } from "./common";

interface Config extends SsbDriveConfig {
  mode: "ssb";
  mic: number;
  processor: 0 | 1 | 2;
  controls: { mic: boolean; processor: boolean };
}

/** A few syllables of speech: a bursty envelope between 0 and 1. */
const speech = (t: number) => {
  const syll = Math.max(0, Math.sin(Math.PI * ((t * 2.2) % 1)));
  return syll * (0.55 + 0.45 * Math.abs(Math.sin(7.3 * t) * Math.cos(2.1 * t)));
};
const PROCESS = [0, 0.45, 0.75];

/** LAB-04 Power Limit Calculator. SSB mode (lesson 3.12): microphone gain, processing, ALC and PEP. */
export function PowerLimitLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const demo = mode === "demo";
  const [mic, setMic] = useState(cfg.mic);
  const [processor, setProcessor] = useState<0 | 1 | 2>(cfg.processor);
  const state: SsbDriveState = { mic, processor };
  const v = ssbDriveVariables(state, cfg)!;
  useReport(onState, v, state as unknown as Record<string, unknown>, [mic, processor]);

  const drive = v.drive as number;
  const k = PROCESS[processor]!;
  const env = sample(
    (t) => {
      const e = speech(t);
      const compressed = e ** (1 - k); // processing lifts the quiet parts toward the peaks
      return Math.min(1, compressed * drive);
    },
    0,
    2,
    300,
  );
  const status = v.alcOver
    ? "Overdriven: the ALC meter is past the top of its range, the voice peaks are flattened, and the signal splatters onto nearby frequencies."
    : processor === 2
      ? "Too much processing: the voice is distorted and splatters, even though the ALC looks fine."
      : drive < 0.6
        ? "Under-driven: the voice peaks are well below full power."
        : `Clean: peaks reach ${fmt(v.pep as number, "W")} PEP and the ALC stays within its range.`;

  return (
    <div className="lab">
      <div className="shack-row">
        <div className="shack-well">
          <Plot
            label={`Transmitted envelope over two seconds of speech. Peak envelope power ${fmt(v.pep as number, "W")}, average ${fmt(v.avg as number, "W")}.`}
            series={[{ points: env, tone: v.distorted ? "c" : "b" }]}
            xDomain={[0, 2]}
            yDomain={[0, 1.15]}
            yTicks={[1]}
            formatY={() => "PEP"}
            xLabel="time"
            yLabel="envelope"
          />
        </div>
        <div className="shack-well" style={{ display: "grid", placeItems: "center" }}>
          <AnalogMeter
            label="ALC"
            unit=""
            value={Math.min(v.alc as number, 1.5)}
            max={1.5}
            overload={v.alcOver as boolean}
            format={(x) => (x > 1.5 ? "over range" : x === 0 ? "idle" : `${Math.round((x / 1.5) * 100)}% of range`)}
          />
        </div>
      </div>
      <div className="knobs">
        {cfg.controls.mic && (
          <Knob
            label="Mic gain"
            value={mic}
            min={0}
            max={1}
            step={0.05}
            onChange={setMic}
            format={(x) => `${Math.round(x * 100)}%`}
            disabled={demo}
          />
        )}
        {cfg.controls.processor && (
          <SegChoice
            label="Speech processor"
            value={String(processor) as "0" | "1" | "2"}
            onChange={(x) => setProcessor(Number(x) as 0 | 1 | 2)}
            disabled={demo}
            options={[
              { value: "0", label: "Off" },
              { value: "1", label: "Moderate" },
              { value: "2", label: "Heavy" },
            ]}
          />
        )}
      </div>
      <Readouts
        items={[
          ["Peak envelope power", fmt(v.pep as number, "W")],
          ["Average power", fmt(v.avg as number, "W")],
          ["Occupied bandwidth", `${(v.bandwidth as number) / 1000} kHz`],
        ]}
      />
      <p className="lab-state" role="status">
        {status}
      </p>
    </div>
  );
}
