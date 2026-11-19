"use client";
import { useState } from "react";
import { powerBenchVariables, type PowerBenchConfig, type PowerBenchState } from "@hampath/ham-sim";
import { Knob } from "@hampath/ui";
import type { LabBodyProps } from "./registry";
import { Readouts, SegChoice, Stepper, fmt, useReport } from "./common";

interface Config extends PowerBenchConfig, PowerBenchState {
  /** Sources offered when the source can be changed (2 to 4). */
  supplies?: PowerBenchState["supply"][];
  controls: {
    batteries: boolean;
    wiring: boolean;
    load: { min: number; max: number; step: number } | false;
    gauge: boolean;
    fuse: boolean;
    supply: boolean;
  };
}

const SUPPLY_LABEL: Record<PowerBenchState["supply"], string> = {
  battery: "Battery",
  linear: "Linear supply",
  switching: "Switching supply",
  unregulated: "Unregulated supply",
};

/** LAB-15 Power Bench: battery banks, internal resistance, wire gauge, fuses and power supplies. */
export function PowerBenchLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const c = cfg.controls;
  const demo = mode === "demo";
  const [s, setS] = useState<PowerBenchState>({
    batteries: cfg.batteries,
    wiring: cfg.wiring,
    load: cfg.load,
    gauge: cfg.gauge,
    length: cfg.length,
    fuse: cfg.fuse,
    supply: cfg.supply,
  });
  const v = powerBenchVariables(s, cfg)!;
  useReport(onState, v, s as unknown as Record<string, unknown>, [s]);
  const set = <K extends keyof PowerBenchState>(k: K, x: PowerBenchState[K]) => setS((cur) => ({ ...cur, [k]: x }));

  const n = s.batteries;
  const usingBattery = s.supply === "battery";
  const boxes = Array.from({ length: n }, (_, i) =>
    s.wiring === "series" ? { x: 20 + i * 62, y: 60 } : { x: 20, y: 18 + i * (120 / Math.max(n, 1)) },
  );

  const status =
    s.fuse === "none"
      ? "No fuse: a short anywhere in the long positive lead could overheat the wire and start a fire."
      : s.fuse === "radio"
        ? "The fuse is at the radio end, so the whole run of wire from the battery is unprotected."
        : (v.drop as number) > 0.5
          ? `The wire is too thin: it loses ${fmt(v.drop as number, "V")} on the way.`
          : v.chirp
            ? "An unregulated supply sags each time the transmitter keys: CW will chirp."
            : v.rfNoise
              ? "Switching supplies are small and light, but can radiate RF noise into the receiver."
              : usingBattery && c.load && (v.sag as number) > 0.3
                ? `Internal resistance: drawing ${fmt(s.load, "A")} drops the battery's terminal voltage by ${fmt(v.sag as number, "V")}.`
                : "Fused at the battery, with heavy enough wire.";

  return (
    <div className="lab">
      <div className="shack-well">
        <svg
          viewBox="0 0 520 170"
          role="img"
          aria-label={`${usingBattery ? `${n} battery${n > 1 ? "s" : ""} of ${cfg.cellV} V in ${s.wiring}` : SUPPLY_LABEL[s.supply]}, number ${s.gauge} wire ${s.length} m to the radio, fuse ${s.fuse === "none" ? "missing" : `at the ${s.fuse}`}.`}
        >
          {usingBattery ? (
            boxes.map((b, i) => (
              <g key={i}>
                <rect
                  className="part"
                  x={b.x}
                  y={b.y}
                  width="52"
                  height={s.wiring === "series" ? 50 : Math.min(34, 110 / n)}
                  rx="4"
                />
                <text
                  className="part-value"
                  x={b.x + 26}
                  y={b.y + (s.wiring === "series" ? 30 : 20)}
                  textAnchor="middle"
                >
                  {cfg.cellV} V
                </text>
              </g>
            ))
          ) : (
            <g>
              <rect className="part" x="12" y="48" width="132" height="74" rx="6" />
              {/* Two lines ("Switching" / "supply") so the longest name fits its box. */}
              <text className="part-value part-value-sm" x="78" y="80" textAnchor="middle">
                {SUPPLY_LABEL[s.supply].split(" ").map((w, i) => (
                  <tspan key={i} x="78" dy={i ? 20 : 0}>
                    {w}
                  </tspan>
                ))}
              </text>
            </g>
          )}
          <path
            className="wire"
            d={`M${usingBattery ? (s.wiring === "series" ? 10 + n * 62 : 72) : 144},85 H440`}
            strokeWidth={s.gauge === 8 ? 7 : s.gauge === 10 ? 5.5 : s.gauge === 12 ? 4 : 2.5}
          />
          {s.fuse !== "none" && (
            <g>
              <rect className="fuse" x={s.fuse === "battery" ? 205 : 395} y="76" width="34" height="18" rx="4" />
              <text className="part-value" x={s.fuse === "battery" ? 222 : 412} y="70" textAnchor="middle">
                fuse
              </text>
            </g>
          )}
          <text className="part-value" x="320" y="112" textAnchor="middle">
            #{s.gauge} wire, {s.length} m
          </text>
          <rect className="part" x="440" y="55" width="74" height="60" rx="6" />
          <text className="part-value" x="477" y="90" textAnchor="middle">
            radio
          </text>
        </svg>
      </div>
      <div className="knobs">
        {c.supply && (
          <SegChoice
            label="Source"
            value={s.supply}
            onChange={(x) => set("supply", x)}
            disabled={demo}
            options={(cfg.supplies ?? ["linear", "switching"]).map((k) => ({ value: k, label: SUPPLY_LABEL[k] }))}
          />
        )}
        {c.batteries && (
          <Stepper
            label="Batteries"
            values={[1, 2, 3, 4]}
            value={n}
            onChange={(x) => set("batteries", x)}
            format={String}
            disabled={demo}
          />
        )}
        {c.wiring && (
          <SegChoice
            label="Wiring"
            value={s.wiring}
            onChange={(x) => set("wiring", x)}
            disabled={demo}
            options={[
              { value: "series", label: "Series" },
              { value: "parallel", label: "Parallel" },
            ]}
          />
        )}
        {c.load && (
          <Knob
            label="Load current"
            value={s.load}
            {...c.load}
            onChange={(x) => set("load", x)}
            format={(x) => fmt(x, "A")}
            disabled={demo}
          />
        )}
        {c.gauge && (
          <SegChoice
            label="Wire gauge"
            value={String(s.gauge) as "14"}
            onChange={(x) => set("gauge", Number(x) as PowerBenchState["gauge"])}
            disabled={demo}
            options={["14", "12", "10", "8"].map((g) => ({ value: g as "14", label: `#${g}` }))}
          />
        )}
        {c.fuse && (
          <SegChoice
            label="Fuse"
            value={s.fuse}
            onChange={(x) => set("fuse", x)}
            disabled={demo}
            options={[
              { value: "battery", label: "At the battery" },
              { value: "radio", label: "At the radio" },
              { value: "none", label: "None" },
            ]}
          />
        )}
      </div>
      <Readouts
        items={[
          ...(usingBattery
            ? ([
                ["Bank voltage", fmt(v.V as number, "V")],
                ["Capacity", `${v.Ah} Ah`],
                ["Terminal voltage", fmt(v.terminal as number, "V")],
              ] as [string, string][])
            : []),
          ["Lost in the wire", fmt(v.drop as number, "V")],
          ["At the radio", fmt(v.atRadio as number, "V")],
        ]}
      />
      <p className="lab-state" role="status">
        {status}
      </p>
    </div>
  );
}
