"use client";
import { useState } from "react";
import {
  COLOURS,
  MULTIPLIER_COLOURS,
  TOLERANCE_COLOURS,
  TOLERANCE_PERCENT,
  colourCodeVariables,
  multiplierOf,
  type Colour,
  type ColourCodeState,
  type MultiplierColour,
  type ToleranceColour,
} from "@hampath/ham-sim";
import type { LabBodyProps } from "./registry";
import { Readouts, fmt, useReport } from "./common";

type Bands = ColourCodeState["bands"];
interface Config {
  bands: Bands;
  /** Speed round: match a series of target values. */
  game?: boolean;
  controls: { bands: [boolean, boolean, boolean, boolean] };
}

/** Targets for the speed round: [ohms, tolerance %]. */
const TARGETS: [number, number][] = [
  [470, 5],
  [10_000, 10],
  [2200, 5],
  [33, 10],
  [100_000, 1],
  [4700, 5],
  [1_000_000, 20],
  [68, 2],
  [390, 5],
  [270_000, 10],
];

const ROLE = ["first digit", "second digit", "multiplier", "tolerance"];

function meaning(i: number, c: string): string {
  if (i < 2) return `${COLOURS.indexOf(c as Colour)}`;
  if (i === 2) return `× ${Number(multiplierOf(c as MultiplierColour).toPrecision(3))}`;
  return `± ${TOLERANCE_PERCENT[c as ToleranceColour]}%`;
}

/** LAB-18 Resistor Colour Code: set the bands, read the value; names always shown, never colour alone. */
export function ColourCodeLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const demo = mode === "demo";
  const [bands, setBands] = useState<Bands>(cfg.bands);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(0);
  const v = colourCodeVariables({ bands, score })!;
  useReport(onState, v, { bands, score }, [bands, score]);
  const target = cfg.game ? TARGETS[round % TARGETS.length]! : null;
  const matched = target && Math.abs((v.R as number) - target[0]) < 1e-9 && v.tol === target[1];

  const options = (i: number): readonly string[] =>
    i < 2 ? COLOURS : i === 2 ? MULTIPLIER_COLOURS : TOLERANCE_COLOURS;
  const setBand = (i: number, c: string) => setBands((b) => b.map((x, j) => (j === i ? c : x)) as Bands);

  return (
    <div className="lab">
      {target && (
        <p className="lab-prompt" aria-live="polite">
          Round {round + 1}: make {fmt(target[0], "Ω")} ± {target[1]}%. Score: {score}
        </p>
      )}
      <div className="board shack-well">
        <svg
          viewBox="0 0 540 150"
          role="img"
          aria-label={`Resistor bands: ${bands.map((c, i) => `${ROLE[i]} ${c}`).join(", ")}. Value ${fmt(v.R as number, "Ω")} plus or minus ${v.tol}%.`}
        >
          <path className="part-line" d="M20,70 H110 M430,70 H520" />
          <rect x="110" y="35" width="320" height="70" rx="30" className="resistor-body" />
          {bands.map((c, i) => {
            const x = [140, 210, 280, 380][i]!;
            return (
              <g key={i}>
                <rect x={x} y="35" width="22" height="70" className={`band band-${c}`} />
                <text className="socket-text" x={x + 11} y="132" textAnchor="middle">
                  {c}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="controls">
        {bands.map((c, i) => (
          <label key={i} className="control">
            <span className="control-label">
              Band {i + 1}: {ROLE[i]}
            </span>
            <select
              className="select"
              value={c}
              disabled={demo || !cfg.controls.bands[i]}
              onChange={(e) => setBand(i, e.target.value)}
            >
              {options(i).map((o) => (
                <option key={o} value={o}>
                  {o} ({meaning(i, o)})
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <Readouts
        items={[
          ["Value", fmt(v.R as number, "Ω")],
          ["Tolerance", `± ${v.tol}%`],
          ["Lowest", fmt(v.min as number, "Ω")],
          ["Highest", fmt(v.max as number, "Ω")],
        ]}
      />
      <p className="lab-state">Reading: {bands.map((c, i) => `${c} = ${meaning(i, c)}`).join(", ")}</p>
      {target && (
        <div className="lab-foot">
          <p className={matched ? "lab-success" : "lab-hint"} role="status">
            {matched ? "Match!" : "Not yet."}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!matched || demo}
            onClick={() => {
              setScore((s) => s + 1);
              setRound((r) => r + 1);
            }}
          >
            Next resistor
          </button>
        </div>
      )}
    </div>
  );
}
