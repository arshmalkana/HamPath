"use client";
import { useState } from "react";
import { yagiModel, yagiPattern, yagiVariables, type YagiElement, type YagiState } from "@hampath/ham-sim";
import type { LabBodyProps } from "./registry";
import { Readouts, SegChoice, Stepper, useReport } from "./common";

interface YagiConfig {
  mode: "yagi";
  reflector: number;
  driven: number;
  director: number;
  feed: YagiElement | null;
  controls: { lengths: boolean; feed: boolean };
}

const POS: { key: YagiElement; place: string; x: number }[] = [
  { key: "reflector", place: "Rear", x: 90 },
  { key: "driven", place: "Middle", x: 200 },
  { key: "director", place: "Front", x: 300 },
];
const LENGTHS = Array.from({ length: 31 }, (_, i) => Number((0.85 + i * 0.01).toFixed(2)));

function role(s: YagiState, k: YagiElement): string {
  if (k === "driven") return s.feed === "driven" ? "the driven element, fed by the feedline" : "not fed yet";
  const fed = s.feed === k ? ", but the feedline is here instead of the middle" : "";
  if (s[k] >= s.driven * 1.02) return `longer, so it acts as a reflector${fed}`;
  if (s[k] <= s.driven * 0.98) return `shorter, so it acts as a director${fed}`;
  return `about the same length as the middle, so it does little${fed}`;
}

function YagiBody({ cfg, demo, onState }: { cfg: YagiConfig; demo: boolean; onState: LabBodyProps["onState"] }) {
  const [s, setS] = useState<YagiState>({
    mode: "yagi",
    reflector: cfg.reflector,
    driven: cfg.driven,
    director: cfg.director,
    feed: cfg.feed,
  });
  const v = yagiVariables(s)!;
  useReport(onState, v, s as unknown as Record<string, unknown>, [s]);
  const m = yagiModel(s);
  const set = (k: keyof YagiState, x: unknown) => setS((cur) => ({ ...cur, [k]: x }));

  // polar pattern, beam toward the director (right)
  const pts = Array.from({ length: 73 }, (_, i) => {
    const t = (i / 72) * 2 * Math.PI;
    const r = 60 * yagiPattern(m, t);
    return `${(80 + r * Math.cos(t)).toFixed(1)},${(80 - r * Math.sin(t)).toFixed(1)}`;
  }).join(" ");

  return (
    <div className="lab">
      <div className="shack-row">
        <div className="shack-well">
          <svg
            viewBox="0 0 390 200"
            role="img"
            aria-label={`Three-element Yagi seen from above. ${POS.map((p) => `${p.place} element ${Math.round(s[p.key] * 100)}% of a half-wave, ${role(s, p.key)}`).join("; ")}. The feedline is ${s.feed ? `on the ${POS.find((p) => p.key === s.feed)!.place.toLowerCase()} element` : "not connected"}.`}
          >
            <path className="part-line yagi-boom" d="M50,100 H340" />
            <text className="part-value" x="345" y="96" textAnchor="start">
              boom
            </text>
            {POS.map((p) => {
              const half = 80 * s[p.key];
              return (
                <g key={p.key}>
                  <path
                    className={`part-line yagi-element${s.feed === p.key ? " yagi-fed" : ""}`}
                    d={`M${p.x},${100 - half} V${100 + half}`}
                  />
                  <text className="part-value" x={p.x} y="196" textAnchor="middle">
                    {p.place}
                  </text>
                  {s.feed === p.key && <path className="part-line yagi-feed" d={`M${p.x},100 l-30,40`} />}
                </g>
              );
            })}
          </svg>
          <p className="shack-label">Beam direction: toward the front →</p>
        </div>
        <div className="shack-well" style={{ display: "grid", placeItems: "center" }}>
          <svg
            viewBox="0 0 160 160"
            width="160"
            role="img"
            aria-label={`Radiation pattern from above: gain ${m.gain} dB over a dipole, front-to-back ${m.fb} dB.`}
          >
            <circle className="polar-ring" cx="80" cy="80" r="60" />
            <circle className="polar-ring" cx="80" cy="80" r="30" />
            <polygon className="polar-lobe" points={pts} />
          </svg>
          <p className="shack-label">Pattern seen from above</p>
        </div>
      </div>
      <div className="knobs">
        {cfg.controls.lengths &&
          POS.map((p) => (
            <Stepper
              key={p.key}
              label={`${p.place} element length`}
              values={LENGTHS}
              value={s[p.key]}
              onChange={(x) => set(p.key, x)}
              format={(x) => `${Math.round(x * 100)}%`}
              disabled={demo}
            />
          ))}
        {cfg.controls.feed && (
          <SegChoice
            label="Connect the feedline to"
            value={s.feed ?? ("none" as YagiElement)}
            onChange={(x) => set("feed", x)}
            disabled={demo}
            options={POS.map((p) => ({ value: p.key, label: p.place }))}
          />
        )}
      </div>
      <Readouts
        items={[
          ["Forward gain", `${m.gain} dBd`],
          ["Front-to-back", `${m.fb} dB`],
        ]}
      />
      <p className="lab-state" role="status">
        {POS.map((p) => `${p.place}: ${role(s, p.key)}`).join(". ")}.
      </p>
    </div>
  );
}

/** LAB-28 Antenna Builder. Yagi mode (lesson 3.09); more modes arrive with section 6. */
export function AntennaBuilderLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as YagiConfig;
  return <YagiBody cfg={cfg} demo={mode === "demo"} onState={onState} />;
}
