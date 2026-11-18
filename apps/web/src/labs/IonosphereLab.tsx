"use client";
import { useState } from "react";
import { REGION_HEIGHT_KM, ionosphereVariables, type IonosphereConfig, type IonosphereState } from "@hampath/ham-sim";
import { Knob } from "@hampath/ui";
import type { LabBodyProps } from "./registry";
import { Readouts, Stepper, useReport } from "./common";

type Range = { min: number; max: number; step: number };
interface Config extends IonosphereConfig, IonosphereState {
  bands?: number[];
  controls: { f: boolean; angle: Range | false; hour: Range | false };
}

const W = 520;
const GROUND = 200;
const X0 = 30;
const MAX_KM = 5200;
const sx = (km: number) => X0 + (km / MAX_KM) * (W - X0 - 10);
const sy = (h: number) => GROUND - h * 0.45;
const km = (x: number) => `${Math.round(x).toLocaleString("en-CA")} km`;
const hh = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${h % 1 ? "30" : "00"}`;

/** LAB-30 Ionosphere Simulator: ground wave, sky wave, skip, absorption and the MUF. */
export function IonosphereLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const c = cfg.controls;
  const demo = mode === "demo";
  const [s, setS] = useState<IonosphereState>({ f: cfg.f, angle: cfg.angle, hour: cfg.hour });
  const v = ionosphereVariables(s, cfg)!;
  useReport(onState, v, s as unknown as Record<string, unknown>, [s]);
  const set = <K extends keyof IonosphereState>(k: K, x: IonosphereState[K]) => setS((cur) => ({ ...cur, [k]: x }));

  const ion = v.ionization as number;
  const day = v.dayFactor as number;
  const hop = v.hop as number;
  const h = v.region === 1 ? REGION_HEIGHT_KM.E : REGION_HEIGHT_KM.F2;
  let ray = "";
  if (v.refracted) {
    let x = 0;
    ray = `M${sx(0)},${GROUND}`;
    const hops = Math.max(1, Math.min(8, cfg.rx ? (v.hopsToRx as number) : 1));
    for (let i = 0; i < hops; i++) {
      ray += ` L${sx(x + hop / 2)},${sy(h)} L${sx(x + hop)},${GROUND}`;
      x += hop;
    }
  } else if (v.absorbed) {
    const t = Math.tan(((s.angle || 1) * Math.PI) / 180);
    ray = `M${sx(0)},${GROUND} L${Math.min(W, sx(0) + 30 / t)},${sy(70)}`;
  } else {
    const t = Math.tan(((s.angle || 1) * Math.PI) / 180);
    ray = `M${sx(0)},${GROUND} L${Math.min(W, sx(0) + GROUND / t)},0`;
  }

  const status = v.absorbed
    ? "Absorbed in the D region: in daylight it soaks up the lower HF bands."
    : v.escapes
      ? "Too high a frequency for this angle: it passes through the ionosphere into space."
      : `Refracted by the ${v.region === 1 ? "E" : "F2"} region and returned ${km(hop)} away. Between the end of the ground wave (${km(v.groundWave as number)}) and there is the skip zone.`;

  return (
    <div className="lab">
      <div className="shack-well">
        <svg
          viewBox={`0 0 ${W} 220`}
          role="img"
          aria-label={`Side view, not to scale. Local time ${hh(s.hour)}. ${status}`}
        >
          {day > 0.05 && (
            <rect className="iono-d" x="0" y={sy(80)} width={W} height={sy(60) - sy(80)} opacity={0.15 + 0.4 * day} />
          )}
          {day > 0.05 && (
            <rect
              className="iono-layer"
              x="0"
              y={sy(110)}
              width={W}
              height={sy(90) - sy(110)}
              opacity={0.15 + 0.35 * day}
            />
          )}
          {v.split && (
            <rect className="iono-layer" x="0" y={sy(220)} width={W} height={sy(180) - sy(220)} opacity={0.25} />
          )}
          <rect
            className="iono-layer"
            x="0"
            y={sy(340)}
            width={W}
            height={sy(270) - sy(340)}
            opacity={0.15 + 0.5 * ion}
          />
          <text className="part-value" x={W - 8} y={sy(345) - 4} textAnchor="end">
            {v.split ? "F2" : "F"}
          </text>
          {v.split && (
            <text className="part-value" x={W - 8} y={sy(225) - 4} textAnchor="end">
              F1
            </text>
          )}
          {day > 0.05 && (
            <text className="part-value" x={W - 8} y={sy(112) - 4} textAnchor="end">
              E
            </text>
          )}
          {day > 0.05 && (
            <text className="part-value" x={W - 8} y={sy(80) + 12} textAnchor="end">
              D
            </text>
          )}
          <rect
            className="iono-groundwave"
            x={sx(0)}
            y={GROUND - 8}
            width={sx(v.groundWave as number) - sx(0)}
            height="8"
          />
          {v.refracted && (v.skipZone as number) > 0 && (
            <rect
              className="iono-skip"
              x={sx(v.groundWave as number)}
              y={GROUND - 30}
              width={sx(hop) - sx(v.groundWave as number)}
              height="30"
            />
          )}
          <path className="iono-ground" d={`M0,${GROUND} H${W}`} />
          <path className={`iono-ray${v.absorbed ? " iono-ray-dead" : ""}`} d={ray} />
          {cfg.rx ? <circle className="feed-point" cx={sx(cfg.rx)} cy={GROUND} r="5" /> : null}
          <circle className="feed-point" cx={sx(0)} cy={GROUND} r="5" />
        </svg>
      </div>
      <div className="knobs">
        {c.f && cfg.bands && (
          <Stepper
            label="Frequency"
            values={cfg.bands}
            value={s.f}
            onChange={(x) => set("f", x)}
            format={(x) => `${x} MHz`}
            disabled={demo}
          />
        )}
        {c.angle && (
          <Knob
            label="Radiation angle"
            value={s.angle}
            {...c.angle}
            onChange={(x) => set("angle", x)}
            format={(x) => `${x}°`}
            disabled={demo}
          />
        )}
        {c.hour && (
          <Knob
            label="Local time"
            value={s.hour}
            {...c.hour}
            onChange={(x) => set("hour", x)}
            format={hh}
            disabled={demo}
          />
        )}
      </div>
      <Readouts
        items={[
          ["Hop distance", v.refracted ? km(hop) : "–"],
          ["Ground wave", km(v.groundWave as number)],
          ["MUF at this angle", `${(v.muf as number).toFixed(1)} MHz`],
          ["Ionization", `${Math.round(ion * 100)}%`],
          ...(cfg.rx
            ? ([[`Hops to ${km(cfg.rx)}`, v.refracted ? String(v.hopsToRx) : "–"]] as [string, string][])
            : []),
        ]}
      />
      <p className="lab-state" role="status">
        {status}
      </p>
    </div>
  );
}
