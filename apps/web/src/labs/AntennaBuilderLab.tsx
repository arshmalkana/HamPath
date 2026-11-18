"use client";
import { useState } from "react";
import {
  DIPOLE_K,
  LOOP_K,
  dipoleVariables,
  loopVariables,
  verticalVariables,
  yagiModel,
  yagiPattern,
  yagiVariables,
  type DipoleState,
  type LoopState,
  type VerticalState,
  type YagiElement,
  type YagiState,
} from "@hampath/ham-sim";
import { Knob } from "@hampath/ui";
import type { LabBodyProps } from "./registry";
import { Readouts, SegChoice, Stepper, useReport } from "./common";

type Range = { min: number; max: number; step: number };
type Body<C> = { cfg: C; demo: boolean; onState: LabBodyProps["onState"] };
const MHz = (x: number) => `${Number(x.toFixed(3))} MHz`;
const m2 = (x: number) => `${x.toFixed(2)} m`;

/** Polar plot points for a pattern r(θ) (θ = 0 to the right). */
function polar(r: (t: number) => number, cx = 80, cy = 80, R = 60): string {
  return Array.from({ length: 145 }, (_, i) => {
    const t = (i / 144) * 2 * Math.PI;
    const rr = R * r(t);
    return `${(cx + rr * Math.cos(t)).toFixed(1)},${(cy - rr * Math.sin(t)).toFixed(1)}`;
  }).join(" ");
}

// ---- Yagi --------------------------------------------------------------------------------------

interface YagiConfig extends YagiState {
  /** Design frequency (MHz): shows element lengths in metres. */
  f?: number;
  controls: { lengths: boolean; feed: boolean; directors?: boolean; spacing?: boolean };
}

const POS: { key: YagiElement; place: string; x: number }[] = [
  { key: "reflector", place: "Rear", x: 70 },
  { key: "driven", place: "Middle", x: 150 },
  { key: "director", place: "Front", x: 230 },
];
const LENGTHS = Array.from({ length: 31 }, (_, i) => Number((0.85 + i * 0.01).toFixed(2)));
const SPACINGS = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5];

function role(s: YagiState, k: YagiElement): string {
  if (k === "driven") return s.feed === "driven" ? "the driven element, fed by the feedline" : "not fed yet";
  const fed = s.feed === k ? ", but the feedline is here instead of the middle" : "";
  if (s[k] >= s.driven * 1.02) return `longer, so it acts as a reflector${fed}`;
  if (s[k] <= s.driven * 0.98) return `shorter, so it acts as a director${fed}`;
  return `about the same length as the middle, so it does little${fed}`;
}

function YagiBody({ cfg, demo, onState }: Body<YagiConfig>) {
  const [s, setS] = useState<YagiState>({
    mode: "yagi",
    reflector: cfg.reflector,
    driven: cfg.driven,
    director: cfg.director,
    feed: cfg.feed,
    directors: cfg.directors ?? 1,
    spacing: cfg.spacing ?? 0.2,
  });
  const v = yagiVariables(s)!;
  useReport(onState, v, s as unknown as Record<string, unknown>, [s]);
  const m = yagiModel(s);
  const set = (k: keyof YagiState, x: unknown) => setS((cur) => ({ ...cur, [k]: x }));
  const gap = 40 + (s.spacing ?? 0.2) * 200;
  const extra = Array.from({ length: Math.max(0, (s.directors ?? 1) - 1) }, (_, i) => 150 + gap * (i + 2));
  const xs = { reflector: 150 - gap, driven: 150, director: 150 + gap };

  return (
    <div className="lab">
      <div className="shack-row">
        <div className="shack-well">
          <svg
            viewBox="0 0 400 200"
            role="img"
            aria-label={`Yagi seen from above, ${s.directors} director${s.directors === 1 ? "" : "s"}, spacing ${s.spacing} wavelength. ${POS.map((p) => `${p.place} element ${Math.round(s[p.key] * 100)}% of a half-wave, ${role(s, p.key)}`).join("; ")}.`}
          >
            <path
              className="part-line yagi-boom"
              d={`M${xs.reflector - 20},100 H${Math.min(395, (extra.at(-1) ?? xs.director) + 20)}`}
            />
            {POS.map((p) => {
              const half = 70 * s[p.key];
              const x = Math.min(390, xs[p.key]);
              return (
                <g key={p.key}>
                  <path
                    className={`part-line yagi-element${s.feed === p.key ? " yagi-fed" : ""}`}
                    d={`M${x},${100 - half} V${100 + half}`}
                  />
                  <text className="part-value" x={x} y="194" textAnchor="middle">
                    {p.place}
                  </text>
                  {s.feed === p.key && <path className="part-line yagi-feed" d={`M${x},100 l-24,36`} />}
                </g>
              );
            })}
            {extra.map((x, i) => (
              <path
                key={i}
                className="part-line yagi-element"
                d={`M${Math.min(390, x)},${100 - 70 * s.director * (1 - 0.02 * (i + 1))} V${100 + 70 * s.director * (1 - 0.02 * (i + 1))}`}
              />
            ))}
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
            <polygon className="polar-lobe" points={polar((t) => yagiPattern(m, t))} />
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
        {cfg.controls.directors && (
          <Stepper
            label="Directors"
            values={[1, 2, 3, 4]}
            value={s.directors ?? 1}
            onChange={(x) => set("directors", x)}
            format={String}
            disabled={demo}
          />
        )}
        {cfg.controls.spacing && (
          <Stepper
            label="Element spacing"
            values={SPACINGS}
            value={s.spacing ?? 0.2}
            onChange={(x) => set("spacing", x)}
            format={(x) => `${x} λ`}
            disabled={demo}
          />
        )}
      </div>
      <Readouts
        items={[
          ["Forward gain", `${m.gain} dBd`],
          ["Front-to-back", `${m.fb} dB`],
          ...(cfg.f
            ? ([
                ["Driven (143 ÷ f)", m2((DIPOLE_K / cfg.f) * s.driven)],
                ["Reflector (150 ÷ f)", m2((DIPOLE_K / cfg.f) * s.reflector)],
              ] as [string, string][])
            : []),
        ]}
      />
      <p className="lab-state" role="status">
        {POS.map((p) => `${p.place}: ${role(s, p.key)}`).join(". ")}.
      </p>
    </div>
  );
}

// ---- Dipole ------------------------------------------------------------------------------------

interface DipoleConfig extends DipoleState {
  controls: { length: Range | false; orientation: boolean };
}

function DipoleBody({ cfg, demo, onState }: Body<DipoleConfig>) {
  const [s, setS] = useState<DipoleState>({
    mode: "dipole",
    f: cfg.f,
    length: cfg.length,
    orientation: cfg.orientation,
  });
  const v = dipoleVariables(s)!;
  useReport(onState, v, s as unknown as Record<string, unknown>, [s]);
  const set = (k: keyof DipoleState, x: unknown) => setS((cur) => ({ ...cur, [k]: x }));
  const ns = s.orientation === "ns";
  // Figure-eight broadside to the wire; the wire is drawn along the compass axis it points.
  const pattern = polar((t) => Math.abs(ns ? Math.cos(t) : Math.sin(t)));

  return (
    <div className="lab">
      <div className="shack-row">
        <div className="shack-well" style={{ display: "grid", placeItems: "center" }}>
          <svg
            viewBox="0 0 160 160"
            width="200"
            role="img"
            aria-label={`Dipole seen from above with its ends pointing ${ns ? "north and south" : "east and west"}. It radiates mostly ${ns ? "east and west" : "north and south"}.`}
          >
            <circle className="polar-ring" cx="80" cy="80" r="60" />
            <polygon className="polar-lobe" points={pattern} />
            <path className="part-line yagi-element" d={ns ? "M80,25 V135" : "M25,80 H135"} />
            <circle className="insulator" cx={ns ? 80 : 25} cy={ns ? 25 : 80} r="4" />
            <circle className="insulator" cx={ns ? 80 : 135} cy={ns ? 135 : 80} r="4" />
            {["N", "E", "S", "W"].map((d, i) => (
              <text key={d} className="part-value" x={[80, 152, 80, 8][i]} y={[12, 84, 156, 84][i]} textAnchor="middle">
                {d}
              </text>
            ))}
          </svg>
        </div>
      </div>
      <div className="knobs">
        {cfg.controls.length && (
          <Knob
            label="Dipole length"
            value={s.length}
            {...cfg.controls.length}
            onChange={(x) => set("length", x)}
            format={m2}
            disabled={demo}
          />
        )}
        {cfg.controls.orientation && (
          <SegChoice
            label="Ends point"
            value={s.orientation}
            onChange={(x) => set("orientation", x)}
            disabled={demo}
            options={[
              { value: "ns", label: "North–south" },
              { value: "ew", label: "East–west" },
            ]}
          />
        )}
      </div>
      <Readouts
        items={[
          ["Operating frequency", MHz(s.f)],
          ["Length", m2(s.length)],
          ["Resonates at (143 ÷ L)", MHz(v.f0 as number)],
        ]}
      />
      <p className="lab-state" role="status">
        {v.resonant
          ? "Resonant on your frequency."
          : v.tooLong
            ? "Too long: it resonates below your frequency. Shorten it to raise the resonant frequency."
            : "Too short: it resonates above your frequency. Lengthen it to lower the resonant frequency."}{" "}
        A dipole radiates broadside: most energy goes out at right angles to the wire.
      </p>
    </div>
  );
}

// ---- Vertical ----------------------------------------------------------------------------------

interface VerticalConfig extends VerticalState {
  whipReactance?: number;
  controls: { length: Range | false; radials: boolean; coil: Range | false };
}

function VerticalBody({ cfg, demo, onState }: Body<VerticalConfig>) {
  const [s, setS] = useState<VerticalState>({
    mode: "vertical",
    f: cfg.f,
    length: cfg.length,
    radials: cfg.radials,
    coil: cfg.coil ?? 0,
  });
  const v = verticalVariables(s, cfg)!;
  useReport(onState, v, s as unknown as Record<string, unknown>, [s]);
  const set = (k: keyof VerticalState, x: unknown) => setS((cur) => ({ ...cur, [k]: x }));
  const whip = Boolean(cfg.whipReactance);
  const radial =
    s.radials === "horizontal"
      ? "M110,150 H40 M110,150 H180"
      : s.radials === "drooping"
        ? "M110,150 L50,180 M110,150 L170,180"
        : "";

  return (
    <div className="lab">
      <div className="shack-well" style={{ display: "grid", placeItems: "center" }}>
        <svg
          viewBox="0 0 220 200"
          width="220"
          role="img"
          aria-label={`${whip ? "Short mobile whip" : "Quarter-wave vertical"}, ${m2(s.length)} tall, ${s.radials === "none" ? "no radials" : `${s.radials} radials`}${whip ? `, loading coil ${s.coil} microhenrys` : ""}.`}
        >
          <path className="part-line yagi-element" d={`M110,150 V${150 - Math.min(130, whip ? 60 : 130)}`} />
          {whip && <path className="part-line" d="M104,120 q12,-4 0,-8 q12,-4 0,-8 q12,-4 0,-8 q12,-4 0,-8" />}
          {radial && <path className="part-line" d={radial} />}
          <circle className="insulator" cx="110" cy="150" r="4" />
        </svg>
      </div>
      <div className="knobs">
        {cfg.controls.length && (
          <Knob
            label="Vertical length"
            value={s.length}
            {...cfg.controls.length}
            onChange={(x) => set("length", x)}
            format={m2}
            disabled={demo}
          />
        )}
        {cfg.controls.radials && (
          <SegChoice
            label="Radials"
            value={s.radials}
            onChange={(x) => set("radials", x)}
            disabled={demo}
            options={[
              { value: "none", label: "None" },
              { value: "horizontal", label: "Horizontal" },
              { value: "drooping", label: "Sloping down" },
            ]}
          />
        )}
        {cfg.controls.coil && (
          <Knob
            label="Loading coil"
            value={s.coil ?? 0}
            {...cfg.controls.coil}
            onChange={(x) => set("coil", x)}
            format={(x) => `${x} µH`}
            disabled={demo}
          />
        )}
      </div>
      <Readouts
        items={[
          ["Operating frequency", MHz(s.f)],
          ...(whip
            ? ([
                ["Whip reactance", `−${cfg.whipReactance} Ω (capacitive)`],
                ["Coil reactance", `+${Math.round(v.coilReactance as number)} Ω`],
              ] as [string, string][])
            : ([["Resonates at (71.3 ÷ L)", MHz(v.f0 as number)]] as [string, string][])),
          ["Feed impedance", s.radials === "none" ? "lossy (no radials)" : `${v.feedZ} Ω`],
        ]}
      />
      <p className="lab-state" role="status">
        {whip
          ? v.resonant
            ? "The coil's inductive reactance cancels the short whip's capacitive reactance: resonant."
            : "A short whip is capacitive. Add inductance until the coil cancels it."
          : s.radials === "none"
            ? "No radials: ground losses waste power. A ground-mounted vertical needs a radial system."
            : s.radials === "horizontal"
              ? `Horizontal radials: about 36 Ω, a poor match to 50 Ω coax.${v.resonant ? "" : " Length isn't resonant yet."}`
              : `Sloping radials raise the feed impedance to about 50 Ω.${v.resonant ? " Resonant, and a good match." : " Now set the length (71.3 ÷ f)."}`}
      </p>
    </div>
  );
}

// ---- Loop --------------------------------------------------------------------------------------

interface LoopConfig extends LoopState {
  controls: { perimeter: Range | false; feed: boolean };
}

function LoopBody({ cfg, demo, onState }: Body<LoopConfig>) {
  const [s, setS] = useState<LoopState>({
    mode: "loop",
    f: cfg.f,
    perimeter: cfg.perimeter,
    shape: cfg.shape,
    feed: cfg.feed,
  });
  const v = loopVariables(s)!;
  useReport(onState, v, s as unknown as Record<string, unknown>, [s]);
  const set = (k: keyof LoopState, x: unknown) => setS((cur) => ({ ...cur, [k]: x }));
  const quad = s.shape === "quad";
  const feed = s.feed === "bottom" ? (quad ? [110, 160] : [110, 160]) : quad ? [60, 100] : [85, 105];

  return (
    <div className="lab">
      <div className="shack-well" style={{ display: "grid", placeItems: "center" }}>
        <svg
          viewBox="0 0 220 180"
          width="220"
          role="img"
          aria-label={`${quad ? "Quad loop (square)" : "Delta loop (triangle)"}, ${m2(s.perimeter)} of wire, fed ${s.feed === "bottom" ? "in the centre of the bottom side" : "on a side"}: ${v.horizontal ? "horizontal" : "vertical"} polarization.`}
        >
          {quad ? (
            <rect className="loop-wire" x="60" y="40" width="100" height="120" />
          ) : (
            <polygon className="loop-wire" points="110,30 160,160 60,160" />
          )}
          <circle className="feed-point" cx={feed[0]} cy={feed[1]} r="6" />
        </svg>
      </div>
      <div className="knobs">
        {cfg.controls.perimeter && (
          <Knob
            label="Loop wire length"
            value={s.perimeter}
            {...cfg.controls.perimeter}
            onChange={(x) => set("perimeter", x)}
            format={m2}
            disabled={demo}
          />
        )}
        {cfg.controls.feed && (
          <SegChoice
            label="Feed point"
            value={s.feed}
            onChange={(x) => set("feed", x)}
            disabled={demo}
            options={[
              { value: "bottom", label: "Centre of the bottom" },
              { value: "side", label: "On a side" },
            ]}
          />
        )}
      </div>
      <Readouts
        items={[
          ["Operating frequency", MHz(s.f)],
          ["Resonates at (306 ÷ L)", MHz(v.f0 as number)],
          ["Polarization", v.horizontal ? "Horizontal" : "Vertical"],
        ]}
      />
      <p className="lab-state" role="status">
        {v.resonant
          ? "About one wavelength of wire: resonant."
          : `Not resonant. A full-wave loop needs about ${LOOP_K} ÷ f metres of wire.`}{" "}
        Fed on a horizontal side it's horizontally polarized; on a vertical side, vertically.
      </p>
    </div>
  );
}

/** LAB-28 Antenna Builder: Yagi, dipole, vertical and loop modes. */
export function AntennaBuilderLab({ config, mode, onState }: LabBodyProps) {
  const demo = mode === "demo";
  switch ((config as { mode?: string }).mode) {
    case "dipole":
      return <DipoleBody cfg={config as unknown as DipoleConfig} demo={demo} onState={onState} />;
    case "vertical":
      return <VerticalBody cfg={config as unknown as VerticalConfig} demo={demo} onState={onState} />;
    case "loop":
      return <LoopBody cfg={config as unknown as LoopConfig} demo={demo} onState={onState} />;
    default:
      return <YagiBody cfg={config as unknown as YagiConfig} demo={demo} onState={onState} />;
  }
}
