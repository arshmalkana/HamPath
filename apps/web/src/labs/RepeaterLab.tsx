"use client";
import { useState } from "react";
import { repeaterVariables, type RepeaterConfig, type RepeaterState } from "@hampath/ham-sim";
import { ToggleSwitch } from "@hampath/ui";
import type { LabBodyProps } from "./registry";
import { Readouts, SegChoice, Stepper, useReport } from "./common";

interface Config extends RepeaterConfig {
  start: RepeaterState;
  /** Tones offered (Hz); 0 = no tone. */
  tones: number[];
  /** Offsets offered (kHz); default −600, simplex, +600. */
  offsets?: number[];
  controls: { offset: boolean; tone: boolean; reverse: boolean };
}

const mhz = (x: number) => `${x.toFixed(3)} MHz`;
const toneText = (t: number | null) => (t ? `${t.toFixed(1)} Hz` : "none");

/** LAB-08 Repeater Lab: offset, CTCSS tone, and checking for a simplex path. */
export function RepeaterLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const demo = mode === "demo";
  const [s, setS] = useState<RepeaterState>(cfg.start);
  const v = repeaterVariables(s, cfg)!;
  useReport(onState, v, s as unknown as Record<string, unknown>, [s]);
  const set = <K extends keyof RepeaterState>(k: K, x: RepeaterState[K]) => setS((cur) => ({ ...cur, [k]: x }));

  const status = s.reverse
    ? v.hearsDirect
      ? "Listening on the repeater's input: you can hear the other station directly. You could move to a simplex frequency."
      : "Listening on the input: you can't hear the other station directly, so you need the repeater."
    : !v.onInput
      ? `You're transmitting on ${mhz(v.txFreq as number)}, but the repeater listens on ${mhz(v.inputFreq as number)}. It doesn't hear you.`
      : !v.toneOk
        ? "Right frequency, but the repeater needs its CTCSS tone before it will open."
        : "The repeater hears you on its input and retransmits you on its output.";

  return (
    <div className="lab">
      <div className="shack-well">
        <svg viewBox="0 0 640 140" role="img" aria-label={status}>
          <rect className="part" x="10" y="60" width="100" height="44" rx="6" />
          <text className="part-value" x="60" y="87" textAnchor="middle">
            you
          </text>
          <rect className="part" x="255" y="34" width="130" height="70" rx="6" />
          <text className="part-value" x="320" y="63" textAnchor="middle">
            repeater
          </text>
          <text className="socket-text" x="320" y="87" textAnchor="middle">
            {v.accessed ? "on air" : "idle"}
          </text>
          <rect className="part" x="480" y="60" width="150" height="44" rx="6" />
          <text className="part-value" x="555" y="87" textAnchor="middle">
            other station
          </text>
          <path className={v.onInput && !s.reverse ? "iono-ray" : "iono-ray iono-ray-dead"} d="M110,82 L255,62" />
          <text className="socket-text" x="180" y="26" textAnchor="middle">
            in {mhz(v.inputFreq as number)}
          </text>
          <path
            className={v.accessed ? "iono-ray" : "iono-ray iono-ray-dead"}
            d="M385,62 L480,82"
            strokeDasharray={v.accessed ? undefined : "4 4"}
          />
          <text className="socket-text" x="440" y="26" textAnchor="middle">
            out {mhz(cfg.output)}
          </text>
          {s.reverse && cfg.hearsDirect && (
            <path className="iono-ray" d="M60,104 V128 H555 V104" fill="none" strokeDasharray="6 5" />
          )}
        </svg>
      </div>
      <div className="knobs">
        {cfg.controls.offset && (
          <SegChoice
            label="Offset"
            value={String(s.offset) as "0"}
            onChange={(x) => set("offset", Number(x))}
            disabled={demo}
            options={(cfg.offsets ?? [-600, 0, 600]).map((o) => ({
              value: String(o) as "0",
              label: o === 0 ? "Simplex" : `${o > 0 ? "+" : "−"}${Math.abs(o)} kHz`,
            }))}
          />
        )}
        {cfg.controls.tone && (
          <Stepper
            label="CTCSS tone"
            values={cfg.tones}
            value={s.tone ?? 0}
            onChange={(x) => set("tone", x || null)}
            format={(x) => toneText(x || null)}
            disabled={demo}
          />
        )}
        {cfg.controls.reverse && (
          <ToggleSwitch
            label="Reverse (listen on input)"
            checked={Boolean(s.reverse)}
            onChange={(x) => set("reverse", x)}
            disabled={demo}
          />
        )}
      </div>
      <Readouts
        items={[
          ["You transmit on", mhz(v.txFreq as number)],
          ["Repeater input", mhz(v.inputFreq as number)],
          ["Repeater output", mhz(cfg.output)],
          ["Your tone", toneText(s.tone)],
        ]}
      />
      <p className="lab-state" role="status">
        {status}
      </p>
    </div>
  );
}
