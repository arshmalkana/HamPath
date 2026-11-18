"use client";
import { useState } from "react";
import {
  DIELECTRICS,
  LINE_TYPES,
  feedlineVariables,
  type Dielectric,
  type FeedlineConfig,
  type FeedlineState,
  type LineId,
} from "@hampath/ham-sim";
import { Knob, ToggleSwitch } from "@hampath/ui";
import type { LabBodyProps } from "./registry";
import { Readouts, SegChoice, Stepper, useReport } from "./common";

type Range = { min: number; max: number; step: number };
interface Config extends FeedlineConfig, FeedlineState {
  lines?: LineId[];
  /** Frequencies offered (Hz). */
  bands?: number[];
  controls: {
    D?: boolean;
    d?: boolean;
    dielectric?: boolean;
    S?: boolean;
    line?: boolean;
    length?: Range | false;
    f?: boolean;
    balun?: boolean;
  };
}

const MM = (lo: number, hi: number, step: number) =>
  Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => Number((lo + i * step).toFixed(2)));
const D_VALUES = MM(2, 12, 0.5);
const d_VALUES = MM(0.5, 4, 0.1);
const S_VALUES = MM(5, 150, 5);
const mhz = (f: number) => (f >= 1e6 ? `${Number((f / 1e6).toPrecision(4))} MHz` : `${f / 1e3} kHz`);

/** LAB-26 Feedline Lab: what sets characteristic impedance, how lines lose power, and baluns. */
export function FeedlineLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const c = cfg.controls;
  const demo = mode === "demo";
  const [s, setS] = useState<FeedlineState>({
    line: cfg.line,
    length: cfg.length,
    f: cfg.f,
    balun: cfg.balun ?? false,
    D: cfg.D,
    d: cfg.d,
    dielectric: cfg.dielectric,
    S: cfg.S,
  });
  const v = feedlineVariables(s, cfg)!;
  useReport(onState, v, s as unknown as Record<string, unknown>, [s]);
  const set = <K extends keyof FeedlineState>(k: K, x: FeedlineState[K]) => setS((cur) => ({ ...cur, [k]: x }));
  const line = LINE_TYPES[s.line];

  let picture;
  if (cfg.mode === "coax-geometry") {
    const R = (s.D ?? 7) * 11;
    const r = (s.d ?? 2) * 11;
    picture = (
      <svg
        viewBox="0 0 220 180"
        width="220"
        role="img"
        aria-label={`Coax cross-section: shield ${s.D} mm across, centre conductor ${s.d} mm, ${DIELECTRICS[s.dielectric ?? "solid"].name.toLowerCase()} dielectric.`}
      >
        <circle className="coax-shield" cx="110" cy="90" r={Math.min(85, R / 2 + 4)} />
        <circle
          className={`coax-dielectric coax-${s.dielectric ?? "solid"}`}
          cx="110"
          cy="90"
          r={Math.min(81, R / 2)}
        />
        <circle className="coax-centre" cx="110" cy="90" r={Math.max(2, r / 2)} />
      </svg>
    );
  } else if (cfg.mode === "open-geometry") {
    const S = s.S ?? 50;
    const half = Math.min(100, S * 0.7);
    const rr = Math.max(2, (s.d ?? 2) * 2);
    picture = (
      <svg
        viewBox="0 0 240 120"
        width="240"
        role="img"
        aria-label={`Two-wire line: wires ${s.d} mm thick, ${S} mm apart.`}
      >
        <path className="part-line" d={`M${120 - half},60 H${120 + half}`} strokeDasharray="3 4" />
        <circle className="coax-centre" cx={120 - half} cy="60" r={rr} />
        <circle className="coax-centre" cx={120 + half} cy="60" r={rr} />
        <text className="part-value" x="120" y="100" textAnchor="middle">
          {S} mm
        </text>
      </svg>
    );
  } else {
    picture = (
      <svg
        viewBox="0 0 520 110"
        role="img"
        aria-label={`${line.name}, ${s.length} m long${cfg.antenna ? `, feeding a dipole${s.balun ? " through a balun" : " with no balun"}` : ""}.`}
      >
        <rect className="part" x="10" y="35" width="70" height="40" rx="5" />
        <text className="part-value" x="45" y="60" textAnchor="middle">
          {cfg.mode === "balun" && line.balanced ? "tuner" : "radio"}
        </text>
        {cfg.mode === "balun" && line.balanced && s.balun && (
          <rect className="balun" x="84" y="42" width="34" height="26" rx="4" />
        )}
        <path
          className={line.balanced ? "feed-ladder" : "wire"}
          d={`M${cfg.mode === "balun" && line.balanced && s.balun ? 118 : 80},55 H${cfg.antenna && !line.balanced && s.balun ? 400 : 440}`}
        />
        {cfg.antenna && !line.balanced && s.balun && (
          <rect className="balun" x="400" y="42" width="34" height="26" rx="4" />
        )}
        <path className="part-line" d="M440,55 L470,20 M440,55 L470,90" />
        <text className="part-value" x="260" y="90" textAnchor="middle">
          {line.name}, {s.length} m
        </text>
        {(s.balun ?? false) && (
          <text className="part-value" x={line.balanced ? 101 : 417} y="35" textAnchor="middle">
            balun
          </text>
        )}
      </svg>
    );
  }

  const status = v.commonMode
    ? line.balanced
      ? "Balanced line on an unbalanced tuner output: the currents aren't equal and opposite, so the line radiates. Add a balun."
      : "Coax feeding a balanced dipole: current flows on the outside of the shield and the coax radiates. Add a balun."
    : cfg.mode === "coax-geometry"
      ? "Z0 depends only on the ratio of shield to centre-conductor diameter, and the dielectric. Not on length."
      : cfg.mode === "open-geometry"
        ? "Z0 depends on the wire spacing and the wire diameter."
        : `The line turns ${(v.lossDb as number).toFixed(1)} dB of loss into heat: ${Math.round((v.delivered as number) * 100)}% of your power reaches the antenna.`;

  return (
    <div className="lab">
      <div className="shack-well" style={{ display: "grid", placeItems: "center" }}>
        {picture}
      </div>
      <div className="knobs">
        {c.line && cfg.lines && (
          <SegChoice
            label="Feedline"
            value={s.line}
            onChange={(x) => set("line", x)}
            disabled={demo}
            options={cfg.lines.map((l) => ({ value: l, label: LINE_TYPES[l].name }))}
          />
        )}
        {c.D && (
          <Stepper
            label="Shield diameter"
            values={D_VALUES}
            value={s.D ?? 7}
            onChange={(x) => set("D", x)}
            format={(x) => `${x} mm`}
            disabled={demo}
          />
        )}
        {c.d && (
          <Stepper
            label="Centre conductor diameter"
            values={d_VALUES}
            value={s.d ?? 2}
            onChange={(x) => set("d", x)}
            format={(x) => `${x} mm`}
            disabled={demo}
          />
        )}
        {c.dielectric && (
          <SegChoice
            label="Dielectric"
            value={s.dielectric ?? "solid"}
            onChange={(x) => set("dielectric", x as Dielectric)}
            disabled={demo}
            options={(Object.keys(DIELECTRICS) as Dielectric[]).map((k) => ({ value: k, label: DIELECTRICS[k].name }))}
          />
        )}
        {c.S && (
          <Stepper
            label="Wire spacing"
            values={S_VALUES}
            value={s.S ?? 50}
            onChange={(x) => set("S", x)}
            format={(x) => `${x} mm`}
            disabled={demo}
          />
        )}
        {c.length && (
          <Knob
            label="Length"
            value={s.length}
            {...c.length}
            onChange={(x) => set("length", x)}
            format={(x) => `${x} m`}
            disabled={demo}
          />
        )}
        {c.f && cfg.bands && (
          <Stepper
            label="Frequency"
            values={cfg.bands}
            value={s.f}
            onChange={(x) => set("f", x)}
            format={mhz}
            disabled={demo}
          />
        )}
        {c.balun && (
          <ToggleSwitch label="Balun" checked={Boolean(s.balun)} onChange={(x) => set("balun", x)} disabled={demo} />
        )}
      </div>
      <Readouts
        items={[
          ["Characteristic impedance", `${Math.round(v.Z0 as number)} Ω`],
          ...(cfg.mode === "coax-geometry"
            ? ([["Velocity factor", (v.vf as number).toFixed(2)]] as [string, string][])
            : []),
          ...(cfg.mode === "loss" || cfg.mode === "balun"
            ? ([
                ["Line loss", `${(v.lossDb as number).toFixed(1)} dB`],
                ["Reaches the antenna", `${Math.round((v.delivered as number) * 100)}%`],
              ] as [string, string][])
            : []),
        ]}
      />
      <p className="lab-state" role="status">
        {status}
      </p>
    </div>
  );
}
