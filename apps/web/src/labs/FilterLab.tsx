"use client";
import { useState } from "react";
import {
  FILTER_NAMES,
  filterResponse,
  filterVariables,
  type FilterConfig,
  type FilterState,
  type FilterType,
} from "@hampath/ham-sim";
import { Plot, sample } from "@hampath/ui";
import type { LabBodyProps } from "./registry";
import { Readouts, SegChoice, Stepper, useReport } from "./common";

interface Config extends FilterConfig, FilterState {
  types: FilterType[];
  /** Cut-off / edge / centre values offered (MHz). */
  values: number[];
  /** Plot range (MHz) and scale. */
  axis: { min: number; max: number; log: boolean };
  labels?: { wanted?: string; interferers?: string };
}

const mhz = (x: number) => `${Number(x.toPrecision(4))} MHz`;

/** LAB-34 Filter Designer: pick a filter type and its edges to keep what you want and block the rest. */
export function FilterLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const demo = mode === "demo";
  const [s, setS] = useState<FilterState>({ type: cfg.type, f1: cfg.f1, f2: cfg.f2 ?? cfg.f1 });
  const v = filterVariables(s, cfg)!;
  useReport(onState, v, s as unknown as Record<string, unknown>, [s]);
  const set = <K extends keyof FilterState>(k: K, x: FilterState[K]) => setS((cur) => ({ ...cur, [k]: x }));
  const two = s.type === "bandpass" || s.type === "bandreject";
  const { min, max, log } = cfg.axis;
  const curve = sample((f) => filterResponse(s.type, f, s.f1, s.f2), min, max, 400, log);
  const markers = [
    ...cfg.wanted.map((f) => ({ x: f, label: `${cfg.labels?.wanted ?? "keep"} ${Number(f.toPrecision(4))}` })),
    ...cfg.interferers.map((f) => ({
      x: f,
      label: `${cfg.labels?.interferers ?? "block"} ${Number(f.toPrecision(4))}`,
    })),
  ];

  return (
    <div className="lab">
      <div className="shack-well">
        <Plot
          label={`${FILTER_NAMES[s.type]} filter response. Keep: ${cfg.wanted.map(mhz).join(", ")}. Block: ${cfg.interferers.map(mhz).join(", ")}. Weakest wanted signal passes at ${Math.round((v.wantedMin as number) * 100)}%; the strongest interferer is ${(v.rejectDb as number).toFixed(0)} dB down.`}
          series={[{ points: curve, tone: "b" }]}
          xDomain={[min, max]}
          xLog={log}
          yDomain={[0, 1.1]}
          xTicks={[min, log ? Math.sqrt(min * max) : (min + max) / 2, max]}
          formatX={(x) => `${Number(x.toPrecision(3))}`}
          yTicks={[0, 1]}
          formatY={(y) => (y === 1 ? "pass" : "stop")}
          xLabel="frequency (MHz)"
          yLabel="response"
          markers={markers}
        />
      </div>
      <div className="knobs">
        <SegChoice
          label="Filter type"
          value={s.type}
          onChange={(x) => set("type", x)}
          disabled={demo}
          options={cfg.types.map((t) => ({ value: t, label: FILTER_NAMES[t] }))}
        />
        <Stepper
          label={two ? "Lower edge" : s.type === "notch" ? "Notch centre" : "Cut-off"}
          values={cfg.values}
          value={s.f1}
          onChange={(x) => set("f1", x)}
          format={mhz}
          disabled={demo}
        />
        {two && (
          <Stepper
            label="Upper edge"
            values={cfg.values}
            value={s.f2 ?? s.f1}
            onChange={(x) => set("f2", x)}
            format={mhz}
            disabled={demo}
          />
        )}
      </div>
      <Readouts
        items={[
          ["Wanted signals passed", `${Math.round((v.wantedMin as number) * 100)}%`],
          ["Interference rejected", `${Math.min(40, v.rejectDb as number).toFixed(0)} dB`],
        ]}
      />
      <p className="lab-state" role="status">
        {v.ok
          ? "Wanted signals through, interference at least 15 dB down."
          : (v.wantedMin as number) < 0.8
            ? "The filter is cutting into the signals you want."
            : "The interference is still getting through."}
      </p>
    </div>
  );
}
