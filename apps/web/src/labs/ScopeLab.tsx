"use client";
import { useState } from "react";
import { bandName, capacitiveReactance, inductiveReactance, scopeVariables } from "@hampath/ham-sim";
import { Plot, ToggleSwitch, sample } from "@hampath/ui";
import type { LabBodyProps } from "./registry";
import { LogKnob, Readouts, SegChoice, fmt, useReport } from "./common";

interface Config {
  f: number;
  fMin: number;
  fMax: number;
  /** "wave": waveform view; "reactance": reactance of a coil or capacitor against frequency. */
  view: "wave" | "reactance";
  harmonic?: boolean;
  phase?: number;
  component?: "L" | "C";
  L?: number;
  C?: number;
  controls: { f: boolean; harmonic?: boolean; phase?: boolean; component?: boolean };
}

const PHASES = [0, 45, 90, 180] as const;

/** LAB-21 AC Scope: frequency, period, wavelength, phase, harmonics, and reactance against frequency. */
export function ScopeLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const demo = mode === "demo";
  const [f, setF] = useState(cfg.f);
  const [harmonic, setHarmonic] = useState(Boolean(cfg.harmonic));
  const [phase, setPhase] = useState<number>(cfg.phase ?? 0);
  const [component, setComponent] = useState<"L" | "C">(cfg.component ?? "L");
  const L = component === "L" ? (cfg.L ?? 10e-6) : 0;
  const C = component === "C" ? (cfg.C ?? 100e-12) : 0;
  const state = { f, harmonic, phase, ...(cfg.view === "reactance" ? { L, C } : {}) };
  const v = scopeVariables(state)!;
  useReport(onState, v, state, [f, harmonic, phase, component]);

  const T = 1 / f;
  const wave = sample((t) => Math.sin(2 * Math.PI * f * t), 0, 2 * T, 240);
  const second = harmonic
    ? sample((t) => 0.6 * Math.sin(2 * Math.PI * 2 * f * t), 0, 2 * T, 240)
    : phase
      ? sample((t) => Math.sin(2 * Math.PI * f * t - (phase * Math.PI) / 180), 0, 2 * T, 240)
      : null;
  const X = component === "L" ? (x: number) => inductiveReactance(x, L) : (x: number) => capacitiveReactance(x, C);
  const Xnow = cfg.view === "reactance" ? X(f) : 0;

  return (
    <div className="lab">
      {cfg.view === "wave" ? (
        <Plot
          label={`Oscilloscope: ${fmt(f, "Hz")} sine wave, period ${fmt(T, "s")}.${harmonic ? ` Second harmonic at ${fmt(2 * f, "Hz")} shown.` : phase ? ` Second trace ${phase}° behind.` : ""}`}
          series={[
            { points: wave, tone: "b" },
            ...(second ? [{ points: second, tone: "a" as const, dashed: true }] : []),
          ]}
          xDomain={[0, 2 * T]}
          yDomain={[-1.2, 1.2]}
          xTicks={[0, T / 2, T, (3 * T) / 2, 2 * T]}
          yTicks={[-1, 0, 1]}
          formatX={(x) => (x === 0 ? "0" : fmt(x, "s", 2))}
          formatY={() => ""}
          xLabel="time"
          yLabel="voltage"
        />
      ) : (
        <Plot
          label={`Reactance of a ${component === "L" ? `${fmt(L, "H")} coil` : `${fmt(C, "F")} capacitor`} against frequency. At ${fmt(f, "Hz")} it is ${fmt(Xnow, "Ω")}.`}
          series={[{ points: sample(X, cfg.fMin, cfg.fMax, 200, true), tone: "a" }]}
          xDomain={[cfg.fMin, cfg.fMax]}
          yDomain={[Math.min(X(cfg.fMin), X(cfg.fMax)) / 2, Math.max(X(cfg.fMin), X(cfg.fMax)) * 2]}
          xLog
          yLog
          xTicks={decades(cfg.fMin, cfg.fMax)}
          formatX={(x) => fmt(x, "Hz", 2)}
          yTicks={decades(Math.min(X(cfg.fMin), X(cfg.fMax)), Math.max(X(cfg.fMin), X(cfg.fMax)))}
          formatY={(y) => fmt(y, "Ω", 2)}
          markers={[{ x: f, label: fmt(Xnow, "Ω") }]}
          xLabel="frequency"
          yLabel="reactance"
        />
      )}
      <div className="knobs">
        {cfg.controls.f ? (
          <LogKnob
            label="Frequency"
            value={f}
            min={cfg.fMin}
            max={cfg.fMax}
            onChange={setF}
            format={(x) => fmt(x, "Hz")}
            disabled={demo}
          />
        ) : (
          <p className="control-locked">Frequency: {fmt(f, "Hz")}</p>
        )}
        {cfg.view === "wave" && cfg.controls.harmonic && (
          <ToggleSwitch label="Second harmonic" checked={harmonic} onChange={setHarmonic} disabled={demo} />
        )}
        {cfg.view === "wave" && cfg.controls.phase && (
          <SegChoice
            label="Phase of second trace"
            value={String(phase)}
            onChange={(p) => setPhase(Number(p))}
            disabled={demo}
            options={PHASES.map((p) => ({ value: String(p), label: `${p}°` }))}
          />
        )}
        {cfg.view === "reactance" && cfg.controls.component && (
          <SegChoice
            label="Component"
            value={component}
            onChange={setComponent}
            disabled={demo}
            options={[
              { value: "L", label: "Coil (L)" },
              { value: "C", label: "Capacitor (C)" },
            ]}
          />
        )}
      </div>
      <Readouts
        items={[
          ["Frequency", fmt(f, "Hz")],
          ["Period (1 ÷ f)", fmt(T, "s")],
          ["Wavelength (300 ÷ MHz)", fmt(v.wavelength as number, "m")],
          ["Band", f >= 20 && f <= 20_000 ? "audio (20 Hz to 20 kHz)" : bandName(f)],
          ...(cfg.view === "reactance"
            ? ([[component === "L" ? "XL" : "XC", fmt(Xnow, "Ω")]] as [string, string][])
            : []),
        ]}
      />
    </div>
  );
}

function decades(a: number, b: number): number[] {
  const out: number[] = [];
  for (let e = Math.ceil(Math.log10(a)); e <= Math.floor(Math.log10(b)); e++) out.push(10 ** e);
  return out;
}
