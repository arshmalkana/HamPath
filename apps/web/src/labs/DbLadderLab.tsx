"use client";
import { useState } from "react";
import { dbLadderVariables } from "@hampath/ham-sim";
import { AnalogMeter, Knob, autoRange } from "@hampath/ui";
import type { LabBodyProps } from "./registry";
import { Readouts, fmt, useReport } from "./common";

interface Stage {
  label: string;
  db: number;
  min?: number;
  max?: number;
  locked?: boolean;
}
interface Config {
  P0: number;
  stages: Stage[];
  controls?: { P0?: { min: number; max: number; step: number } | false };
  /** Show an S-meter view: readings relative to S9 instead of watts. */
  smeter?: { start: number };
}

const signed = (db: number) => `${db > 0 ? "+" : db < 0 ? "−" : "±"}${Math.abs(Math.round(db * 10) / 10)} dB`;

/** LAB-22 dB Ladder: stack gains and losses in dB and watch the watts. */
export function DbLadderLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const demo = mode === "demo";
  const [P0, setP0] = useState(cfg.P0);
  const [stages, setStages] = useState(cfg.stages.map((s) => s.db));
  const vars = dbLadderVariables({ P0, stages })!;
  useReport(onState, vars, { P0, stages }, [P0, stages]);

  // Power after each stage: P0 × 10^(sum of dB so far ÷ 10).
  const rows = cfg.stages.map((s, i) => {
    const dbSoFar = stages.slice(0, i + 1).reduce((a, b) => a + b, 0);
    return { ...s, db: stages[i]!, after: P0 * 10 ** (dbSoFar / 10) };
  });
  const Pout = vars.Pout as number;
  const total = vars.db as number;

  return (
    <div className="lab">
      <div className="knobs">
        {cfg.controls?.P0 ? (
          <Knob
            label="Transmitter power"
            value={P0}
            {...cfg.controls.P0}
            onChange={setP0}
            format={(v) => fmt(v, "W")}
            disabled={demo}
          />
        ) : (
          <p className="control-locked">Starting power: {fmt(P0, "W")}</p>
        )}
      </div>
      <ol className="ladder" aria-label="Stages">
        <li className="ladder-row">
          <span className="ladder-label">Start</span>
          <span />
          <span className="ladder-power">{fmt(P0, "W")}</span>
        </li>
        {rows.map((r, i) => (
          <li key={r.label} className="ladder-row">
            <span className="ladder-label">{r.label}</span>
            {r.locked || demo ? (
              <span className="stepper-value">{signed(r.db)}</span>
            ) : (
              <span className="stepper" role="group" aria-label={`${r.label} gain`}>
                <button
                  type="button"
                  className="stepper-btn"
                  aria-label={`${r.label}: 1 dB less`}
                  disabled={r.db <= (r.min ?? -30)}
                  onClick={() => setStages((st) => st.map((x, j) => (j === i ? x - 1 : x)))}
                >
                  −
                </button>
                <output className="stepper-value" aria-live="polite">
                  {signed(r.db)}
                </output>
                <button
                  type="button"
                  className="stepper-btn"
                  aria-label={`${r.label}: 1 dB more`}
                  disabled={r.db >= (r.max ?? 30)}
                  onClick={() => setStages((st) => st.map((x, j) => (j === i ? x + 1 : x)))}
                >
                  +
                </button>
              </span>
            )}
            <span className="ladder-power">{fmt(r.after, "W")}</span>
          </li>
        ))}
      </ol>
      <div className="meters2">
        <AnalogMeter label="Output power" unit="W" value={Pout} max={autoRange(Pout)} format={(v) => fmt(v, "W")} />
        <Readouts
          items={[
            ["Total", signed(total)],
            ["Power ratio", `× ${Number((vars.ratio as number).toPrecision(3))}`],
            ...(cfg.smeter
              ? ([
                  [
                    "S-meter",
                    cfg.smeter.start + total === 0
                      ? "S9"
                      : `S9 ${cfg.smeter.start + total > 0 ? "+" : "−"} ${Math.abs(Math.round(cfg.smeter.start + total))} dB`,
                  ],
                ] as [string, string][])
              : []),
          ]}
        />
      </div>
    </div>
  );
}
