"use client";
import { useState } from "react";
import { powerDensity, rfExposureVariables, type RfExposureConfig } from "@hampath/ham-sim";
import { Knob, Plot, sample } from "@hampath/ui";
import type { LabBodyProps } from "./registry";
import { Readouts, fmt, useReport } from "./common";

interface Config extends RfExposureConfig {
  distance: number;
  /** What's radiating, e.g. "a 50 W UHF beam". */
  source: string;
  controls: { distance: { min: number; max: number; step: number } };
}

const wm2 = (x: number) => `${x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x.toFixed(2)} W/m²`;

/** LAB-05 RF Exposure Zone: power density falls with the square of distance. */
export function RfExposureLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const demo = mode === "demo";
  const [distance, setDistance] = useState(cfg.distance);
  const v = rfExposureVariables({ distance }, cfg)!;
  useReport(onState, v, { distance }, [distance]);
  const { min, max } = cfg.controls.distance;
  const curve = sample((d) => powerDensity(cfg.power, cfg.gainDbi, d), min, max, 200, true);
  const top = powerDensity(cfg.power, cfg.gainDbi, min);
  const frac = (Math.log(distance) - Math.log(min)) / (Math.log(max) - Math.log(min));

  return (
    <div className="lab">
      <div className="shack-well">
        <svg
          viewBox="0 0 520 90"
          role="img"
          aria-label={`A person ${fmt(distance, "m")} from ${cfg.source}. ${v.safe ? "Outside" : "Inside"} the zone where exposure exceeds the limit.`}
        >
          <rect
            className="rf-zone"
            x="30"
            y="10"
            width={Math.min(
              470,
              470 * ((Math.log(v.safeDistance as number) - Math.log(min)) / (Math.log(max) - Math.log(min))),
            )}
            height="70"
            rx="6"
          />
          <path className="part-line" d="M30,15 V75 M18,25 L30,15 L42,25" />
          <circle className={v.safe ? "rf-person rf-safe" : "rf-person"} cx={30 + 470 * frac} cy="32" r="8" />
          <path
            className={v.safe ? "rf-person rf-safe" : "rf-person"}
            d={`M${30 + 470 * frac},40 v22 m-10,-14 h20 m-10,14 l-8,14 m8,-14 l8,14`}
          />
        </svg>
      </div>
      <div className="shack-well">
        <Plot
          label={`Power density against distance from ${cfg.source}. At ${fmt(distance, "m")} it is ${wm2(v.S as number)}; the limit is ${wm2(cfg.limit)}.`}
          series={[
            { points: curve, tone: "b" },
            {
              points: [
                [min, cfg.limit],
                [max, cfg.limit],
              ],
              tone: "c",
              dashed: true,
              label: "limit",
            },
          ]}
          xDomain={[min, max]}
          yDomain={[Math.min(cfg.limit / 10, powerDensity(cfg.power, cfg.gainDbi, max)), top]}
          xLog
          yLog
          xTicks={[min, Math.sqrt(min * max), max]}
          formatX={(x) => fmt(x, "m", 2)}
          yTicks={[cfg.limit]}
          formatY={() => "limit"}
          xLabel="distance"
          yLabel="power density"
          markers={[{ x: distance, label: wm2(v.S as number) }]}
        />
      </div>
      <div className="knobs">
        <Knob
          label="Distance from the antenna"
          value={distance}
          {...cfg.controls.distance}
          onChange={setDistance}
          format={(x) => fmt(x, "m", 2)}
          disabled={demo}
        />
      </div>
      <Readouts
        items={[
          ["Power density", wm2(v.S as number)],
          ["Example limit", wm2(cfg.limit)],
          ["Safe beyond", fmt(v.safeDistance as number, "m", 2)],
        ]}
      />
      <p className="lab-state" role="status">
        {v.safe ? "Outside the exposure zone." : "Inside the zone where exposure is over the limit: move further away."}{" "}
        Double the distance and the power density drops to a quarter.
      </p>
    </div>
  );
}
