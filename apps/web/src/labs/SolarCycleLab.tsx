"use client";
import { useState } from "react";
import { SOLAR_CYCLE_YEARS, solarCycleVariables, sunspotNumber } from "@hampath/ham-sim";
import { Knob, Plot, sample } from "@hampath/ui";
import type { LabBodyProps } from "./registry";
import { Readouts, useReport } from "./common";

interface Config {
  year: number;
}

/** Sunspot positions on the disc, fixed so they don't jump as the count changes. */
const SPOTS = Array.from({ length: 14 }, (_, i) => {
  const a = i * 2.4;
  const r = 18 + ((i * 37) % 40);
  return [80 + r * Math.cos(a), 80 + r * Math.sin(a) * 0.5];
});

/** LAB-31 Solar Cycle Dial: sunspots, solar flux and how high the bands open. */
export function SolarCycleLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const demo = mode === "demo";
  const [year, setYear] = useState(cfg.year);
  const v = solarCycleVariables({ year })!;
  useReport(onState, v, { year }, [year]);
  const spots = Math.round(((v.ssn as number) / 180) * SPOTS.length);
  const band = (name: string, open: boolean) => [name, open ? "open (daytime DX)" : "closed"] as [string, string];

  return (
    <div className="lab">
      <div className="shack-row">
        <div className="shack-well" style={{ display: "grid", placeItems: "center" }}>
          <svg
            viewBox="0 0 160 160"
            width="160"
            role="img"
            aria-label={`The sun with about ${Math.round(v.ssn as number)} sunspots.`}
          >
            <circle className="sun-disc" cx="80" cy="80" r="70" />
            {SPOTS.slice(0, spots).map(([x, y], i) => (
              <circle key={i} className="sun-spot" cx={x} cy={y} r={3 + (i % 3)} />
            ))}
          </svg>
        </div>
        <div className="shack-well">
          <Plot
            label={`Sunspot number over an 11-year cycle. Year ${year}: about ${Math.round(v.ssn as number)}.`}
            series={[{ points: sample(sunspotNumber, 0, SOLAR_CYCLE_YEARS, 120), tone: "b" }]}
            xDomain={[0, SOLAR_CYCLE_YEARS]}
            yDomain={[0, 200]}
            xTicks={[0, 5.5, 11]}
            formatX={(x) => (x === 0 ? "min" : x === 11 ? "min" : "max")}
            yTicks={[0, 100, 200]}
            formatY={(y) => String(y)}
            xLabel="years (11-year cycle)"
            yLabel="sunspots"
            markers={[{ x: year, label: `year ${year}` }]}
          />
        </div>
      </div>
      <div className="knobs">
        <Knob
          label="Year in the cycle"
          value={year}
          min={0}
          max={11}
          step={0.5}
          onChange={setYear}
          format={(x) => `${x}`}
          disabled={demo}
        />
      </div>
      <Readouts
        items={[
          ["Sunspot number", String(Math.round(v.ssn as number))],
          ["Solar flux (2800 MHz)", String(Math.round(v.sfi as number))],
          ["Midday MUF", `${(v.muf as number).toFixed(0)} MHz`],
          band("10 m", v.open10 as boolean),
          band("20 m", v.open20 as boolean),
        ]}
      />
      <p className="lab-state" role="status">
        More sunspots, more ionization: the maximum usable frequency rises. At solar maximum, frequencies up to 40 MHz
        or more carry DX; 20 m works through the whole cycle.
      </p>
    </div>
  );
}
