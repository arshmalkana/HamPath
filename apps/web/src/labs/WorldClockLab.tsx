"use client";
import { useMemo, useState } from "react";
import {
  clockVariables,
  rulesVariables,
  type RulesConfig,
  type RulesState,
  greatCircle,
  mapPathVariables,
  type ClockConfig,
  type ClockState,
  type LonLat,
  type MapPathConfig,
  type MapPathState,
} from "@hampath/ham-sim";
import { AzimuthalMap, Knob, WorldMap } from "@hampath/ui";
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
interface ClockModeConfig extends ClockConfig {
  mode: "clock";
  fromLabel: string;
  toLabel: string;
  heading: number;
  local: number;
  controls: { heading: boolean; local: boolean };
}

function ClockBody({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as ClockModeConfig;
  const demo = mode === "demo";
  const [s, setS] = useState<ClockState>({ heading: cfg.heading, local: cfg.local });
  const v = clockVariables(s, cfg)!;
  useReport(onState, v, s as unknown as Record<string, unknown>, [s]);
  const set = <K extends keyof ClockState>(k: K, x: ClockState[K]) => setS((cur) => ({ ...cur, [k]: x }));
  const sign = cfg.offset < 0 ? "−" : "+";
  return (
    <div className="lab">
      {cfg.controls.heading && (
        <div className="shack-well" style={{ display: "grid", placeItems: "center" }}>
          <div style={{ width: "min(100%, 360px)" }}>
            <AzimuthalMap
              center={cfg.from}
              centerLabel={cfg.fromLabel}
              heading={s.heading}
              markers={[{ lon: cfg.to[0], lat: cfg.to[1], label: cfg.toLabel }]}
              label={`Azimuthal map centred on ${cfg.fromLabel}`}
            />
          </div>
        </div>
      )}
      <div className="knobs">
        {cfg.controls.heading && (
          <Knob
            label="Antenna heading"
            value={s.heading}
            min={0}
            max={355}
            step={5}
            onChange={(x) => set("heading", x)}
            format={(x) => `${x}°`}
            disabled={demo}
          />
        )}
        {cfg.controls.local && (
          <Knob
            label="Local time"
            value={s.local}
            min={0}
            max={23.5}
            step={0.5}
            onChange={(x) => set("local", x)}
            format={hhmm}
            disabled={demo}
          />
        )}
      </div>
      <Readouts
        items={[
          ...(cfg.controls.heading
            ? ([
                [`Short path to ${cfg.toLabel}`, `${Math.round(v.shortBearing as number)}°`],
                ["Distance", km(v.distance as number)],
              ] as [string, string][])
            : []),
          ...(cfg.controls.local
            ? ([
                ["Net time", `${hhmm(cfg.utc)} UTC`],
                ["Your time zone", `UTC ${sign} ${Math.abs(cfg.offset)} h`],
              ] as [string, string][])
            : []),
        ]}
      />
      <p className="lab-state" role="status">
        {cfg.controls.heading
          ? v.aimedLong
            ? "Pointed along the long path: the other way round the world, 180° from the short path."
            : v.aimedShort
              ? "Pointed along the short path."
              : "On an azimuthal map, a straight line from the centre shows the true bearing."
          : v.localOk
            ? "Right: local time = UTC + your offset."
            : "Local time = UTC + your offset (a negative offset means subtract)."}
      </p>
    </div>
  );
}

interface ItuConfig extends RulesConfig {
  mode: "itu";
  places: { id: string; lon: number; lat: number }[];
}

function ItuBody({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as ItuConfig;
  const demo = mode === "demo";
  const [answers, setAnswers] = useState<RulesState["answers"]>({});
  const v = rulesVariables({ answers }, cfg)!;
  useReport(onState, v, { answers }, [answers]);
  const date = useMemo(() => new Date("2026-06-21T12:00:00Z"), []);
  return (
    <div className="lab">
      <div className="shack-well">
        <WorldMap
          date={date}
          label="World map with the places to classify"
          markers={cfg.places.map((p) => ({ lon: p.lon, lat: p.lat, label: cfg.cases.find((k) => k.id === p.id)?.situation ?? p.id }))}
        />
      </div>
      <ul className="inspect-list">
        {cfg.cases.map((k) => {
          const got = answers[k.id];
          const right = got ? got === k.answer : null;
          return (
            <li key={k.id} className="inspect-item shack-well" data-state={right === null ? undefined : right ? "right" : "wrong"}>
              <p className="inspect-label">{k.situation}</p>
              <div className="chip-row" role="group" aria-label={k.situation}>
                {k.options.map((o) => (
                  <button key={o} type="button" className="chip" aria-pressed={got === o} disabled={demo || right === true} onClick={() => setAnswers((a) => ({ ...a, [k.id]: o }))}>
                    {o}
                  </button>
                ))}
              </div>
              {right !== null && (
                <p className="inspect-why" role="status">
                  {right ? `Right. ${k.why}` : "Not quite."}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <Readouts items={[["Placed", `${v.correct} of ${v.total}`]]} />
    </div>
  );
}

/** LAB-12 World Map & Clock: propagation (7.06), clock (2.09) and ITU regions (1.21). */
export function WorldClockLab(props: LabBodyProps) {
  const m = (props.config as { mode?: string }).mode;
  return m === "clock" ? <ClockBody {...props} /> : m === "itu" ? <ItuBody {...props} /> : <PropagationBody {...props} />;
}

function PropagationBody({ config, mode, onState }: LabBodyProps) {
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
