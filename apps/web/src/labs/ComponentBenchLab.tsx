"use client";
import { useState } from "react";
import {
  AMP_CLIP,
  AMP_GAIN,
  ZENER_VOLTS,
  benchVariables,
  bjtCollectorCurrent,
  diodeCurrent,
  fetDrainCurrent,
  triodePlateCurrent,
  type BenchState,
  type Device,
} from "@hampath/ham-sim";
import { Knob, Plot, sample } from "@hampath/ui";
import type { LabBodyProps } from "./registry";
import { Readouts, SegChoice, fmt, useReport } from "./common";

type Range = { min: number; max: number; step: number };
interface Config {
  device: Device;
  mode: BenchState["mode"];
  input: number;
  drive?: number;
  controls: { device: boolean; input: Range | false; drive?: Range | false };
}

const DEVICES: Record<
  Device,
  { name: string; input: string; range: Range; curve: (x: number) => number; electrodes: string }
> = {
  diode: {
    name: "Diode",
    input: "Voltage across (anode +)",
    range: { min: -10, max: 2, step: 0.1 },
    curve: (v) => diodeCurrent(v),
    electrodes: "anode → cathode",
  },
  zener: {
    name: "Zener diode",
    input: "Voltage across (anode +)",
    range: { min: -8, max: 2, step: 0.1 },
    curve: (v) => diodeCurrent(v, true),
    electrodes: "anode, cathode",
  },
  bjt: {
    name: "Bipolar transistor (NPN)",
    input: "Base current",
    range: { min: 0, max: 0.0002, step: 0.00001 },
    curve: bjtCollectorCurrent,
    electrodes: "base controls collector → emitter",
  },
  fet: {
    name: "Field-effect transistor (N channel)",
    input: "Gate voltage (reverse bias)",
    range: { min: -4, max: 0, step: 0.25 },
    curve: fetDrainCurrent,
    electrodes: "gate controls source → drain",
  },
  triode: {
    name: "Triode tube",
    input: "Grid voltage",
    range: { min: -8, max: 0, step: 0.5 },
    curve: triodePlateCurrent,
    electrodes: "grid controls cathode → plate",
  },
};

function Symbol({ device }: { device: Device }) {
  const t = (x: number, y: number, s: string, a: "start" | "middle" | "end" = "middle") => (
    <text className="part-value" x={x} y={y} textAnchor={a}>
      {s}
    </text>
  );
  return (
    <svg viewBox="0 0 260 140" width="100%" style={{ maxWidth: 260 }} aria-hidden="true">
      {(device === "diode" || device === "zener") && (
        <g>
          <path className="part-line" d="M20,70 H85 M85,45 L125,70 L85,95 Z M125,45 V95 M125,70 H200" />
          {device === "zener" && <path className="part-line" d="M125,45 L115,38 M125,95 L135,102" />}
          {t(50, 60, "anode")}
          {t(165, 60, "cathode")}
        </g>
      )}
      {device === "bjt" && (
        <g>
          <circle className="part" cx="120" cy="70" r="40" fill="none" />
          <path
            className="part-line"
            d="M30,70 H105 M105,45 V95 M105,58 L140,32 V10 M105,82 L140,108 V130 M130,100 L140,108 L128,110"
          />
          {t(55, 62, "base")}
          {t(150, 18, "collector", "start")}
          {t(150, 132, "emitter", "start")}
        </g>
      )}
      {device === "fet" && (
        <g>
          <path className="part-line" d="M30,95 H95 M100,40 V100 M100,52 H140 V10 M100,88 H140 V130 M90,95 L95,90" />
          {t(55, 87, "gate")}
          {t(150, 22, "drain", "start")}
          {t(150, 126, "source", "start")}
        </g>
      )}
      {device === "triode" && (
        <g>
          <circle className="part" cx="110" cy="70" r="52" fill="none" />
          <path className="part-line" d="M85,35 H135 M110,35 V8 M80,70 H140 M80,70 H40" strokeDasharray="0" />
          <path className="part-line" d="M85,105 Q110,95 135,105 M110,100 V132" />
          {t(150, 22, "plate", "start")}
          {t(30, 62, "grid", "start")}
          {t(150, 128, "cathode", "start")}
        </g>
      )}
    </svg>
  );
}

/** LAB-17 Component Bench: device curves, an amplifier you can overdrive, and a rectifier. */
export function ComponentBenchLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const demo = mode === "demo";
  const [device, setDevice] = useState<Device>(cfg.device);
  const [input, setInput] = useState(cfg.input);
  const [drive, setDrive] = useState(cfg.drive ?? 0.2);
  const d = DEVICES[device];
  const state: BenchState = { device, mode: cfg.mode, input, drive };
  const v = benchVariables(state)!;
  useReport(onState, v, state as unknown as Record<string, unknown>, [device, input, drive]);
  const range = cfg.controls.input || d.range;
  const fmtIn = (x: number) => (device === "bjt" ? fmt(x, "A") : fmt(x, "V"));

  let plot;
  if (cfg.mode === "iv") {
    const pts = sample((x) => d.curve(x) * 1000, d.range.min, d.range.max, 240);
    const ys = pts.map(([, y]) => y);
    plot = (
      <Plot
        label={`${d.name}: current against ${d.input.toLowerCase()}. At ${fmtIn(input)} the current is ${fmt(v.current as number, "A")}.`}
        series={[{ points: pts, tone: "b" }]}
        xDomain={[d.range.min, d.range.max]}
        yDomain={[Math.min(0, ...ys) * 1.1 - 0.5, Math.max(...ys) * 1.1 + 0.5]}
        xTicks={[d.range.min, (d.range.min + d.range.max) / 2]}
        formatX={fmtIn}
        yTicks={[0]}
        formatY={() => "0"}
        xLabel={d.input}
        yLabel="current (mA)"
        markers={[{ x: input, label: fmt(v.current as number, "A", 2) }]}
      />
    );
  } else if (cfg.mode === "amp") {
    const inp = sample((t) => drive * Math.sin(2 * Math.PI * t), 0, 2, 240);
    const out = inp.map(([t, x]) => [t, Math.max(-AMP_CLIP, Math.min(AMP_CLIP, AMP_GAIN * x))] as [number, number]);
    plot = (
      <Plot
        label={`Amplifier with a gain of ${AMP_GAIN}. Input ${fmt(drive, "V")} peak, output ${fmt(v.outputPeak as number, "V")} peak${v.distorted ? ", clipped: distorted" : ""}.`}
        series={[
          { points: inp, tone: "a", dashed: true, label: "Input" },
          { points: out, tone: "b", label: "Output" },
        ]}
        xDomain={[0, 2]}
        yDomain={[-12, 12]}
        yTicks={[-AMP_CLIP, 0, AMP_CLIP]}
        formatY={(y) => `${y} V`}
        xLabel="time"
        yLabel="signal"
      />
    );
  } else {
    const ac = sample((t) => 10 * Math.sin(2 * Math.PI * t), 0, 2, 240);
    const dc = ac.map(([t, x]) => [t, x > 0.6 ? x - 0.6 : 0] as [number, number]);
    plot = (
      <Plot
        label="Rectifier: AC in (dashed), and at the cathode, pulsating DC: only the positive half-cycles get through."
        series={[
          { points: ac, tone: "a", dashed: true, label: "AC in" },
          { points: dc, tone: "b", label: "At the cathode" },
        ]}
        xDomain={[0, 2]}
        yDomain={[-12, 12]}
        yTicks={[-10, 0, 10]}
        formatY={(y) => `${y} V`}
        xLabel="time"
        yLabel="volts"
      />
    );
  }

  const status =
    cfg.mode === "amp"
      ? v.distorted
        ? "Overdriven: output clipped (distorted)"
        : "Linear: output is a bigger copy of the input"
      : cfg.mode === "rectifier"
        ? "Pulsating DC at the cathode"
        : v.regulating
          ? `Reverse breakdown: holding ${ZENER_VOLTS} V`
          : v.saturated
            ? "Saturated: fully on (switch closed)"
            : v.cutoff
              ? "Cut off: fully off (switch open)"
              : v.conducting
                ? device === "diode" || device === "zener"
                  ? "Forward biased: conducting"
                  : "Conducting: input controls output"
                : device === "diode" || device === "zener"
                  ? input < 0
                    ? "Reverse biased: blocking"
                    : "Below 0.6 V: not yet conducting"
                  : "Hardly any current";

  return (
    <div className="lab">
      <div className="shack-row">
        <div className="shack-well" style={{ display: "grid", placeItems: "center" }}>
          <Symbol device={device} />
          <p className="shack-label">
            {d.name}: {d.electrodes}
          </p>
        </div>
        <div className="shack-well">{plot}</div>
      </div>
      <div className="knobs">
        {cfg.controls.device && (
          <SegChoice
            label="Device"
            value={device}
            onChange={(x) => {
              setDevice(x);
              setInput(DEVICES[x].range.max);
            }}
            disabled={demo}
            options={(Object.keys(DEVICES) as Device[]).map((k) => ({
              value: k,
              label: DEVICES[k].name.split(" (")[0]!,
            }))}
          />
        )}
        {cfg.mode === "iv" && cfg.controls.input !== false && (
          <Knob label={d.input} value={input} {...range} onChange={setInput} format={fmtIn} disabled={demo} />
        )}
        {cfg.mode === "amp" && cfg.controls.drive && (
          <Knob
            label="Input signal"
            value={drive}
            {...cfg.controls.drive}
            onChange={setDrive}
            format={(x) => fmt(x, "V")}
            disabled={demo}
          />
        )}
      </div>
      {cfg.mode === "iv" && (
        <Readouts
          items={[
            [d.input, fmtIn(input)],
            ["Output current", fmt(v.current as number, "A")],
          ]}
        />
      )}
      {cfg.mode === "amp" && (
        <Readouts
          items={[
            ["Voltage gain", `× ${AMP_GAIN}`],
            ["Output peak", fmt(v.outputPeak as number, "V")],
          ]}
        />
      )}
      <p className="lab-state" role="status">
        {status}
      </p>
    </div>
  );
}
