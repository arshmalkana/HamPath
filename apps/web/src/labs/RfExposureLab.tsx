"use client";
import { useState } from "react";
import { powerDensity, rfExposureVariables, sc6Limit, sc6Variables, type RfExposureConfig, type Sc6State } from "@hampath/ham-sim";
import { Knob, Plot, ToggleSwitch, sample } from "@hampath/ui";
import type { LabBodyProps } from "./registry";
import { Readouts, fmt, useReport } from "./common";

interface Config extends RfExposureConfig {
  distance: number;
  /** What's radiating, e.g. "a 50 W UHF beam". */
  source: string;
  controls: { distance: { min: number; max: number; step: number } };
}

const wm2 = (x: number) => `${x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x.toFixed(2)} W/m²`;

const fq = (f: number) => (f >= 1000 ? `${Number((f / 1000).toPrecision(3))} GHz` : `${Number(f.toPrecision(3))} MHz`);

function Sc6Body({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Sc6State & { controls: { f: boolean; environment: boolean } };
  const demo = mode === "demo";
  const [s, setS] = useState<Sc6State>({ f: cfg.f, environment: cfg.environment });
  const v = sc6Variables(s)!;
  useReport(onState, v, s as unknown as Record<string, unknown>, [s]);
  const curve = sample((f) => sc6Limit(f, s.environment), 10, 6000, 300, true);
  return (
    <div className="lab">
      <div className="shack-well">
        <Plot
          label={`Safety Code 6 power-density limit against frequency, ${s.environment} environment. At ${fq(s.f)} the limit is ${wm2(v.limit as number)}.`}
          series={[{ points: curve, tone: "b" }]}
          xDomain={[10, 6000]}
          xLog
          yDomain={[0, s.environment === "controlled" ? 55 : 11]}
          xTicks={[10, 48, 300, 6000]}
          formatX={fq}
          yTicks={[0, s.environment === "controlled" ? 50 : 10]}
          formatY={(y) => `${y} W/m²`}
          xLabel="frequency"
          yLabel="limit"
          markers={[{ x: s.f, label: wm2(v.limit as number) }]}
        />
      </div>
      <div className="knobs">
        {cfg.controls.f && (
          <Knob
            label="Frequency"
            value={Math.round(Math.log10(s.f) * 20)}
            min={20}
            max={75}
            step={1}
            onChange={(x) => setS((c) => ({ ...c, f: Number((10 ** (x / 20)).toPrecision(3)) }))}
            format={(x) => fq(Number((10 ** (x / 20)).toPrecision(3)))}
            disabled={demo}
          />
        )}
        {cfg.controls.environment && (
          <ToggleSwitch label="Controlled environment" checked={s.environment === "controlled"} onChange={(x) => setS((c) => ({ ...c, environment: x ? "controlled" : "uncontrolled" }))} disabled={demo} />
        )}
      </div>
      <Readouts items={[["Frequency", fq(s.f)], ["Limit", wm2(v.limit as number)], ["Environment", s.environment]]} />
      <p className="lab-state" role="status">
        {v.lowest
          ? "48 to 300 MHz: the lowest limits, because the human body absorbs RF energy most in this range."
          : s.environment === "controlled"
            ? "Controlled environments (people aware of the exposure) have higher limits than uncontrolled ones (the general public)."
            : "Safety Code 6, from Health Canada, sets RF exposure limits for the human body."}
      </p>
    </div>
  );
}

/** LAB-05 RF Exposure Zone: Safety Code 6 limits (1.24) and inverse-square distance (3.21). */
export function RfExposureLab(props: LabBodyProps) {
  return (props.config as { mode?: string }).mode === "sc6" ? <Sc6Body {...props} /> : <DistanceBody {...props} />;
}

function DistanceBody({ config, mode, onState }: LabBodyProps) {
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
