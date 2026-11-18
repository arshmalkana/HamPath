"use client";
import { useState } from "react";
import { vhfVariables, type VhfState } from "@hampath/ham-sim";
import { Knob, ToggleSwitch } from "@hampath/ui";
import type { LabBodyProps } from "./registry";
import { Readouts, SegChoice, useReport } from "./common";

type Range = { min: number; max: number; step: number };
interface Config extends VhfState {
  controls: {
    band: boolean;
    height: Range | false;
    inversion: boolean;
    sporadicE: boolean;
    aurora: boolean;
    meteors: boolean;
    heading: boolean;
  };
}

const km = (x: number) => `${Math.round(x).toLocaleString("en-CA")} km`;
const BAND_LABEL = { 6: "6 m", 2: "2 m", 0.7: "70 cm" } as const;

/** LAB-32 VHF Propagation Sandbox: radio horizon, ducting, sporadic E, aurora and meteor scatter. */
export function VhfLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const c = cfg.controls;
  const demo = mode === "demo";
  const [s, setS] = useState<VhfState>({
    band: cfg.band,
    height: cfg.height,
    inversion: cfg.inversion ?? false,
    sporadicE: cfg.sporadicE ?? false,
    aurora: cfg.aurora ?? false,
    meteors: cfg.meteors ?? false,
    heading: cfg.heading ?? 180,
  });
  const v = vhfVariables(s)!;
  useReport(onState, v, s as unknown as Record<string, unknown>, [s]);
  const set = <K extends keyof VhfState>(k: K, x: VhfState[K]) => setS((cur) => ({ ...cur, [k]: x }));

  const mech = v.es
    ? "Sporadic E: a dense patch of E-region ionization reflects 6 m signals 1000 to 2000 km."
    : v.meteorLink
      ? "Meteor scatter: brief ionized trails bounce 6 m signals up to about 2000 km."
      : v.auroraLink
        ? "Auroral propagation: beam north and the aurora, at E-region height, scatters your signal. CW copes best with the distortion."
        : v.ducting
          ? "Tropospheric ducting: a temperature inversion traps signals in a duct for hundreds or thousands of km."
          : s.aurora && !v.north
            ? "There's an aurora, but your beam isn't pointed north."
            : s.sporadicE && s.band !== 6
              ? "Sporadic E is up, but it mostly affects 6 m."
              : s.meteors && s.band !== 6
                ? "Meteor scatter works best on 6 m."
                : "Line of sight, stretched a little by normal tropospheric bending: the radio horizon. Even on the best days, normal tropospheric propagation tops out around 800 km; going beyond that takes ducting.";

  return (
    <div className="lab">
      <div className="shack-well">
        <svg
          viewBox="0 0 520 170"
          role="img"
          aria-label={`${BAND_LABEL[s.band]}. ${mech} Reach about ${km(v.reach as number)}.`}
        >
          <rect className="vhf-air" width="520" height="170" />
          {v.es && <ellipse className="vhf-es" cx="260" cy="30" rx="80" ry="12" />}
          {s.aurora && <path className="vhf-aurora" d="M0,10 Q130,40 260,15 T520,20 V45 Q390,60 260,40 T0,45 Z" />}
          {v.ducting && <rect className="vhf-duct" x="0" y="110" width="520" height="35" />}
          {s.meteors &&
            [0, 1, 2].map((i) => <path key={i} className="vhf-meteor" d={`M${150 + i * 90},${20 + i * 6} l30,14`} />)}
          <path className="iono-ground" d="M0,150 Q260,135 520,150" />
          <path className="part-line yagi-element" d={`M40,150 V${150 - Math.min(80, s.height * 1.5)}`} />
          <circle className="feed-point" cx="40" cy={150 - Math.min(80, s.height * 1.5)} r="4" />
          <text className="part-value" x="40" y="166" textAnchor="middle">
            you
          </text>
        </svg>
      </div>
      <div className="knobs">
        {c.band && (
          <SegChoice
            label="Band"
            value={String(s.band) as "6"}
            onChange={(x) => set("band", Number(x) as VhfState["band"])}
            disabled={demo}
            options={(["6", "2", "0.7"] as const).map((b) => ({ value: b as "6", label: BAND_LABEL[Number(b) as 6] }))}
          />
        )}
        {c.height && (
          <Knob
            label="Antenna height"
            value={s.height}
            {...c.height}
            onChange={(x) => set("height", x)}
            format={(x) => `${x} m`}
            disabled={demo}
          />
        )}
        {c.heading && (
          <Knob
            label="Beam heading"
            value={s.heading ?? 0}
            min={0}
            max={345}
            step={15}
            onChange={(x) => set("heading", x)}
            format={(x) => `${x}°`}
            disabled={demo}
          />
        )}
        {c.inversion && (
          <ToggleSwitch
            label="Temperature inversion"
            checked={Boolean(s.inversion)}
            onChange={(x) => set("inversion", x)}
            disabled={demo}
          />
        )}
        {c.sporadicE && (
          <ToggleSwitch
            label="Sporadic E cloud"
            checked={Boolean(s.sporadicE)}
            onChange={(x) => set("sporadicE", x)}
            disabled={demo}
          />
        )}
        {c.aurora && (
          <ToggleSwitch label="Aurora" checked={Boolean(s.aurora)} onChange={(x) => set("aurora", x)} disabled={demo} />
        )}
        {c.meteors && (
          <ToggleSwitch
            label="Meteor shower"
            checked={Boolean(s.meteors)}
            onChange={(x) => set("meteors", x)}
            disabled={demo}
          />
        )}
      </div>
      <Readouts
        items={[
          ["Radio horizon", km(v.horizon as number)],
          ["Reach now", km(v.reach as number)],
        ]}
      />
      <p className="lab-state" role="status">
        {mech}
      </p>
    </div>
  );
}
