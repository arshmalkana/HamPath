"use client";
import { useState } from "react";
import { combineVariables, type CombineState } from "@hampath/ham-sim";
import type { LabBodyProps } from "./registry";
import { LogKnob, Readouts, SegChoice, fmt, useReport } from "./common";

interface Config {
  kind: "R" | "L" | "C";
  arrangement: "series" | "parallel";
  values: number[];
  controls: { kind: boolean; arrangement: boolean; values: boolean };
}

const UNIT = { R: "Ω", L: "H", C: "F" } as const;
const NAME = { R: "Resistors", L: "Inductors", C: "Capacitors" } as const;

/** LAB-20 combiner: put resistors, inductors or capacitors in series or parallel and read the total. */
export function CombinerLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const demo = mode === "demo";
  const [kind, setKind] = useState(cfg.kind);
  const [arrangement, setArrangement] = useState(cfg.arrangement);
  const [values, setValues] = useState(cfg.values);
  const s: CombineState = { kind, arrangement, values };
  const v = combineVariables(s)!;
  useReport(onState, v, s as unknown as Record<string, unknown>, [kind, arrangement, values]);
  const u = UNIT[kind];
  const total = v.total as number;
  const n = values.length;
  const sym = (x: number, y: number, i: number) =>
    kind === "C" ? (
      <g key={i}>
        <line className="part-line" x1={x - 6} y1={y - 16} x2={x - 6} y2={y + 16} strokeWidth={4} />
        <line className="part-line" x1={x + 6} y1={y - 16} x2={x + 6} y2={y + 16} strokeWidth={4} />
      </g>
    ) : kind === "L" ? (
      <path
        key={i}
        className="part-line"
        d={`M${x - 28},${y} ${[0, 1, 2, 3].map(() => `a7,7 0 0 1 14,0`).join(" ")}`}
        transform={`translate(${0} 0)`}
      />
    ) : (
      <path
        key={i}
        className="part-line"
        d={`M${x - 28},${y} ${Array.from({ length: 7 }, (_, k) => `L${x - 21 + k * 7},${y + (k % 2 ? 8 : -8)}`).join(" ")} L${x + 28},${y}`}
      />
    );

  return (
    <div className="lab">
      <div className="board shack-well">
        <svg
          viewBox="0 0 600 200"
          role="img"
          aria-label={`${NAME[kind]} in ${arrangement}: ${values.map((x) => fmt(x, u)).join(", ")}. Total ${fmt(total, u)}.`}
        >
          {arrangement === "series" ? (
            <>
              <path className="wire" d="M30,100 H570" />
              {values.map((x, i) => {
                const cx = 80 + ((i + 0.5) * 440) / n;
                return (
                  <g key={i}>
                    <rect x={cx - 34} y={80} width={68} height={40} fill="var(--shack-well)" />
                    {sym(cx, 100, i)}
                    <text className="part-value" x={cx} y={146} textAnchor="middle">
                      {fmt(x, u)}
                    </text>
                  </g>
                );
              })}
            </>
          ) : (
            <>
              <path
                className="wire"
                d={`M30,100 H120 M480,100 H570 M120,${100 - (n - 1) * 22} V${100 + (n - 1) * 22} M480,${100 - (n - 1) * 22} V${100 + (n - 1) * 22}`}
              />
              {values.map((x, i) => {
                const y = 100 + (i - (n - 1) / 2) * 44;
                return (
                  <g key={i}>
                    <path className="wire" d={`M120,${y} H480`} />
                    <rect x={266} y={y - 18} width={68} height={36} fill="var(--shack-well)" />
                    {sym(300, y, i)}
                    <text className="part-value" x={350} y={y - 8}>
                      {fmt(x, u)}
                    </text>
                  </g>
                );
              })}
            </>
          )}
        </svg>
      </div>
      <div className="knobs">
        {cfg.controls.kind && (
          <SegChoice
            label="Parts"
            value={kind}
            onChange={setKind}
            disabled={demo}
            options={[
              { value: "R", label: "Resistors" },
              { value: "L", label: "Inductors" },
              { value: "C", label: "Capacitors" },
            ]}
          />
        )}
        {cfg.controls.arrangement && (
          <SegChoice
            label="Wiring"
            value={arrangement}
            onChange={setArrangement}
            disabled={demo}
            options={[
              { value: "series", label: "Series" },
              { value: "parallel", label: "Parallel" },
            ]}
          />
        )}
        {cfg.controls.values &&
          values.map((x, i) => (
            <LogKnob
              key={i}
              label={`Part ${i + 1}`}
              value={x}
              min={cfg.values[0]! / 10}
              max={cfg.values[0]! * 10}
              disabled={demo}
              onChange={(nv) => setValues((vs) => vs.map((y, j) => (j === i ? nv : y)))}
              format={(y) => fmt(y, u)}
            />
          ))}
      </div>
      <Readouts
        items={[
          ["Total", fmt(total, u)],
          ["Compared with one part", `× ${Number((v.ratio as number).toPrecision(3))}`],
          [
            "Rule",
            (kind === "C") === (arrangement === "parallel") ? "Values add" : "Total is smaller than the smallest part",
          ],
        ]}
      />
    </div>
  );
}
