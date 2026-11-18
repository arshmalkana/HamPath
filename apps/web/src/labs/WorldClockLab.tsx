"use client";
import { useMemo, useState } from "react";
import { greatCircle, mapPathVariables, type LonLat, type MapPathConfig, type MapPathState } from "@hampath/ham-sim";
import { Knob, WorldMap } from "@hampath/ui";
import type { LabBodyProps } from "./registry";
import { Readouts, Stepper, useReport } from "./common";

interface Config extends MapPathConfig, MapPathState {
  mode: "propagation";
  /** Date (ISO) used for the day/night shading. */
  date: string;
  fromLabel: string;
  toLabel: string;
  bands: number[];
  controls: { utc: boolean; f: boolean };
}

const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${h % 1 ? "30" : "00"}`;
const km = (x: number) => `${Math.round(x).toLocaleString("en-CA")} km`;

/** LAB-12 World Map & Clock. Propagation mode (lesson 7.06): MUF along a path through the day. */
export function WorldClockLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const demo = mode === "demo";
  const [utc, setUtc] = useState(cfg.utc);
  const [f, setF] = useState(cfg.f);
  const state: MapPathState = { utc, f };
  const v = mapPathVariables(state, cfg)!;
  useReport(onState, v, state as unknown as Record<string, unknown>, [utc, f]);
  const date = useMemo(() => {
    const d = new Date(cfg.date);
    d.setUTCHours(Math.floor(utc), (utc % 1) * 60, 0, 0);
    return d;
  }, [cfg.date, utc]);
  const route = useMemo(() => greatCircle(cfg.from as LonLat, cfg.to as LonLat, 48), [cfg.from, cfg.to]);

  const status = v.open
    ? `Open: ${f} MHz is below the MUF on this path.`
    : v.absorbed
      ? `Closed: the path's midpoint is in daylight and the D region absorbs ${f} MHz.`
      : `Closed: ${f} MHz is above the MUF, so it passes through the ionosphere.`;

  return (
    <div className="lab">
      <div className="shack-well">
        <WorldMap
          date={date}
          label={`Path from ${cfg.fromLabel} to ${cfg.toLabel}`}
          markers={[
            { lon: cfg.from[0], lat: cfg.from[1], label: cfg.fromLabel },
            { lon: cfg.to[0], lat: cfg.to[1], label: cfg.toLabel },
          ]}
          paths={[{ points: route }]}
        />
      </div>
      <div className="knobs">
        {cfg.controls.utc && (
          <Knob label="UTC" value={utc} min={0} max={23.5} step={0.5} onChange={setUtc} format={hhmm} disabled={demo} />
        )}
        {cfg.controls.f && (
          <Stepper
            label="Band"
            values={cfg.bands}
            value={f}
            onChange={setF}
            format={(x) => `${x} MHz`}
            disabled={demo}
          />
        )}
      </div>
      <Readouts
        items={[
          ["Midpoint local time", hhmm((Math.round((v.midHour as number) * 2) / 2) % 24)],
          ["MUF", `${(v.muf as number).toFixed(1)} MHz`],
          ["Optimum working frequency", `${(v.owf as number).toFixed(1)} MHz`],
          ["Distance", km(v.distance as number)],
        ]}
      />
      <p className="lab-state" role="status">
        {status}
      </p>
    </div>
  );
}
