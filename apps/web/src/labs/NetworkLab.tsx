"use client";
import { useState } from "react";
import { ohmsLabVariables, solveCircuit, type OhmsLabState, type Topology } from "@hampath/ham-sim";
import { AnalogMeter, Knob, ToggleSwitch, autoRange } from "@hampath/ui";
import type { LabBodyProps } from "./registry";
import { Readouts, fmt, useReport } from "./common";

type Range = { min: number; max: number; step: number };
interface Config {
  topology: Topology;
  E: number;
  resistors: number[];
  closed: boolean;
  controls: { E: Range | false; R: Range | false; switch: boolean; count?: { min: number; max: number } };
  /** Wattage rating of each resistor, to show which ones overheat (lessons 5.06). */
  ratingW?: number;
}

function Zigzag({
  x,
  y,
  vertical,
  label,
  hot,
}: {
  x: number;
  y: number;
  vertical: boolean;
  label: string;
  hot: boolean;
}) {
  const pts = Array.from({ length: 7 }, (_, i) =>
    vertical ? `L${x + (i % 2 ? 10 : -10)},${y - 30 + i * 10}` : `L${x - 30 + i * 10},${y + (i % 2 ? 10 : -10)}`,
  ).join(" ");
  const d = vertical
    ? `M${x},${y - 45} V${y - 35} ${pts} L${x},${y + 35} V${y + 45}`
    : `M${x - 45},${y} H${x - 35} ${pts} L${x + 35},${y} H${x + 45}`;
  return (
    <g aria-hidden="true">
      <path className="part-line" d={d} data-hot={hot} style={hot ? { stroke: "var(--shack-fault)" } : undefined} />
      <text
        className="part-value"
        x={vertical ? x + 16 : x}
        y={vertical ? y + 4 : y + 28}
        textAnchor={vertical ? "start" : "middle"}
      >
        {label}
      </text>
    </g>
  );
}

/** LAB-20 in series/parallel mode: up to four resistors, a knob each, live per-resistor V, I and P. */
export function NetworkLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const demo = mode === "demo";
  const [E, setE] = useState(cfg.E);
  const [rs, setRs] = useState(cfg.resistors);
  const [closed, setClosed] = useState(cfg.closed);
  const state: OhmsLabState = { topology: cfg.topology, E, resistors: rs, closed };
  const vars = ohmsLabVariables(state);
  useReport(onState, vars, state as unknown as Record<string, unknown>, [E, rs, closed]);
  const c = solveCircuit(state);
  const live = c.I > 0;
  const series = cfg.topology === "series";
  const n = rs.length;

  // Geometry: series resistors sit along the top wire; parallel resistors are rungs between two rails.
  const xs = rs.map((_, i) => 200 + ((i + 0.5) * 380) / n);
  return (
    <div className="lab">
      <div className="board shack-well">
        <svg
          viewBox="0 0 640 260"
          role="img"
          aria-label={`${series ? "Series" : "Parallel"} circuit: ${fmt(E, "V")} battery, ${rs.map((r) => fmt(r, "Ω")).join(", ")}. Total ${fmt(c.R, "Ω")}, current ${fmt(c.I, "A")}.`}
        >
          <path
            className="wire"
            data-live={live}
            d={
              series ? "M90,90 V40 H600 V220 H330 M270,220 H90 V150" : "M90,90 V40 H600 M600,220 H330 M270,220 H90 V150"
            }
          />
          {!series && <path className="wire" data-live={live} d="M600,40 V40 M600,220 V220" />}
          {/* battery */}
          <line className="part-line" x1="66" y1="100" x2="114" y2="100" strokeWidth={3} />
          <line className="part-line" x1="78" y1="116" x2="102" y2="116" strokeWidth={6} />
          <path className="part-line" d="M90,116 V150" />
          <text className="part-value" x="124" y="112" textAnchor="start">
            {fmt(E, "V")}
          </text>
          {/* switch */}
          <circle className="part" cx="270" cy="220" r="5" />
          <circle className="part" cx="330" cy="220" r="5" />
          <line className="part-line" x1="270" y1="220" x2="330" y2={closed ? 220 : 194} strokeWidth={4} />
          {series
            ? rs.map((r, i) => (
                <g key={i}>
                  <rect x={xs[i]! - 46} y={30} width={92} height={20} fill="var(--shack-well)" />
                  <Zigzag
                    x={xs[i]!}
                    y={40}
                    vertical={false}
                    label={fmt(r, "Ω")}
                    hot={Boolean(cfg.ratingW && c.resistors[i]!.P > cfg.ratingW)}
                  />
                </g>
              ))
            : rs.map((r, i) => (
                <g key={i}>
                  <path className="wire" data-live={live} d={`M${xs[i]},40 V85 M${xs[i]},175 V220`} />
                  <Zigzag
                    x={xs[i]!}
                    y={130}
                    vertical
                    label={fmt(r, "Ω")}
                    hot={Boolean(cfg.ratingW && c.resistors[i]!.P > cfg.ratingW)}
                  />
                </g>
              ))}
          {!series && (
            <path className="wire" data-live={live} d={`M${xs[0]},220 H600 V220 M${xs[n - 1]},40 H600 V220`} />
          )}
        </svg>
      </div>
      <div className="meters2">
        <AnalogMeter label="Total current" unit="A" value={c.I} max={autoRange(c.I)} format={(v) => fmt(v, "A")} />
        <Readouts
          items={[
            ["Total resistance", fmt(c.R, "Ω")],
            ["Total power", fmt(c.P, "W")],
            [series ? "Same current through each" : "Same voltage across each", series ? fmt(c.I, "A") : fmt(E, "V")],
          ]}
        />
      </div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Each resistor">
        <table className="table" aria-label="Each resistor">
          <thead>
            <tr>
              <th scope="col">Resistor</th>
              <th scope="col" className="num">
                R
              </th>
              <th scope="col" className="num">
                Voltage
              </th>
              <th scope="col" className="num">
                Current
              </th>
              <th scope="col" className="num">
                Power
              </th>
            </tr>
          </thead>
          <tbody>
            {c.resistors.map((r, i) => (
              <tr key={i}>
                <th scope="row">
                  R{i + 1}
                  {cfg.ratingW && r.P > cfg.ratingW ? " (too hot!)" : ""}
                </th>
                <td className="num">{fmt(r.R, "Ω")}</td>
                <td className="num">{fmt(r.E, "V")}</td>
                <td className="num">{fmt(r.I, "A")}</td>
                <td className="num">{fmt(r.P, "W")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="knobs">
        {cfg.controls.E ? (
          <Knob
            label="Battery voltage"
            value={E}
            {...cfg.controls.E}
            onChange={setE}
            format={(v) => fmt(v, "V")}
            disabled={demo}
          />
        ) : (
          <p className="control-locked">Battery fixed at {fmt(E, "V")}</p>
        )}
        {cfg.controls.R
          ? rs.map((r, i) => (
              <Knob
                key={i}
                label={`R${i + 1}`}
                value={r}
                {...(cfg.controls.R as Range)}
                disabled={demo}
                onChange={(v) => setRs((xs2) => xs2.map((x, j) => (j === i ? v : x)))}
                format={(v) => fmt(v, "Ω")}
              />
            ))
          : null}
        {cfg.controls.count && !demo && (
          <div className="control">
            <span className="control-label">Resistors</span>
            <div className="stepper" role="group" aria-label="Number of resistors">
              <button
                type="button"
                className="stepper-btn"
                aria-label="Remove a resistor"
                disabled={n <= cfg.controls.count.min}
                onClick={() => setRs((x) => x.slice(0, -1))}
              >
                −
              </button>
              <output className="stepper-value" aria-live="polite">
                {n}
              </output>
              <button
                type="button"
                className="stepper-btn"
                aria-label="Add a resistor"
                disabled={n >= cfg.controls.count.max}
                onClick={() => setRs((x) => [...x, x[x.length - 1]!])}
              >
                +
              </button>
            </div>
          </div>
        )}
        {cfg.controls.switch && (
          <ToggleSwitch
            label="Switch"
            checked={closed}
            onChange={setClosed}
            onText="closed"
            offText="open"
            disabled={demo}
          />
        )}
      </div>
    </div>
  );
}
