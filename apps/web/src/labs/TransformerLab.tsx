"use client";
import { useState } from "react";
import { transformerVariables } from "@hampath/ham-sim";
import { Knob } from "@hampath/ui";
import type { LabBodyProps } from "./registry";
import { Readouts, fmt, useReport } from "./common";

type Range = { min: number; max: number; step: number } | false;
interface Config {
  Np: number;
  Ns: number;
  Vp: number;
  Rload: number;
  controls: { Np: Range; Ns: Range; Vp: Range; Rload: Range };
}

function Coil({ x, turns, side }: { x: number; turns: number; side: "l" | "r" }) {
  const loops = Math.max(2, Math.min(14, Math.round(turns / 50)));
  const h = 140 / loops;
  const d = Array.from({ length: loops }, (_, i) => {
    const y = 40 + i * h;
    return side === "l" ? `M${x},${y} a${h / 2},${h / 2} 0 0 1 0,${h}` : `M${x},${y} a${h / 2},${h / 2} 0 0 0 0,${h}`;
  }).join(" ");
  return <path className="xfmr-coil" d={d} />;
}

/** LAB-23 Transformer Lab: turns ratio sets voltage up, current down (or the reverse). */
export function TransformerLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const demo = mode === "demo";
  const [Np, setNp] = useState(cfg.Np);
  const [Ns, setNs] = useState(cfg.Ns);
  const [Vp, setVp] = useState(cfg.Vp);
  const [Rload, setRload] = useState(cfg.Rload);
  const v = transformerVariables({ Np, Ns, Vp, Rload })!;
  useReport(onState, v, { Np, Ns, Vp, Rload }, [Np, Ns, Vp, Rload]);
  const knob = (label: string, value: number, set: (n: number) => void, range: Range, f: (n: number) => string) =>
    range ? (
      <Knob label={label} value={value} {...range} onChange={set} format={f} disabled={demo} />
    ) : (
      <p className="control-locked">
        {label}: {f(value)}
      </p>
    );

  return (
    <div className="lab">
      <div className="board shack-well">
        <svg
          viewBox="0 0 400 220"
          role="img"
          aria-label={`Transformer: ${Np} primary turns, ${Ns} secondary turns. ${fmt(Vp, "V")} in, ${fmt(v.Vs as number, "V")} out.`}
        >
          <path className="wire" d="M40,40 H150 M40,180 H150 M250,40 H360 M250,180 H360" />
          <Coil x={150} turns={Np} side="l" />
          <Coil x={250} turns={Ns} side="r" />
          <line className="xfmr-core" x1="192" y1="30" x2="192" y2="190" />
          <line className="xfmr-core" x1="208" y1="30" x2="208" y2="190" />
          <text className="part-value" x="40" y="115">
            {fmt(Vp, "V")}
          </text>
          <text className="part-value" x="300" y="115">
            {fmt(v.Vs as number, "V")}
          </text>
          <text className="socket-text" x="150" y="210" textAnchor="middle">
            {Np} turns
          </text>
          <text className="socket-text" x="250" y="210" textAnchor="middle">
            {Ns} turns
          </text>
        </svg>
      </div>
      <div className="knobs">
        {knob("Primary turns", Np, setNp, cfg.controls.Np, (n) => `${n}`)}
        {knob("Secondary turns", Ns, setNs, cfg.controls.Ns, (n) => `${n}`)}
        {knob("Primary voltage", Vp, setVp, cfg.controls.Vp, (n) => fmt(n, "V"))}
        {knob("Load", Rload, setRload, cfg.controls.Rload, (n) => fmt(n, "Ω"))}
      </div>
      <Readouts
        items={[
          ["Turns ratio Np:Ns", `1 : ${Number((v.ratio as number).toPrecision(3))}`],
          ["Secondary voltage", fmt(v.Vs as number, "V")],
          ["Secondary current", fmt(v.Is as number, "A")],
          ["Primary current", fmt(v.Ip as number, "A")],
          ["Power in = power out", fmt(v.Pout as number, "W")],
          ["Load seen from primary", fmt(v.Zp as number, "Ω")],
        ]}
      />
    </div>
  );
}
