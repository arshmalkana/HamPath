"use client";
import { useState } from "react";
import { scenarioVariables, type ScenarioConfig, type ScenarioState } from "@hampath/ham-sim";
import type { LabBodyProps } from "./registry";
import { Readouts, useReport } from "./common";

interface Config extends ScenarioConfig {
  /** Shown above the log, e.g. "20 m, 14.230 MHz, Saturday afternoon". */
  setting: string;
}

/** Turn-by-turn on-air scenario: pick what you'd say or do next. */
function ScenarioBody({ config, mode, onState, logLabel }: LabBodyProps & { logLabel: string }) {
  const cfg = config as unknown as Config;
  const demo = mode === "demo";
  const [picks, setPicks] = useState<number[]>([]);
  const state: ScenarioState = { picks };
  const v = scenarioVariables(state, cfg)!;
  useReport(onState, v, state as unknown as Record<string, unknown>, [picks]);
  const turn = v.passed as number;
  const current = cfg.turns[turn];
  const pick = picks[turn];
  const chosen = current && pick !== undefined ? current.options[pick] : undefined;

  return (
    <div className="lab">
      <p className="lab-prompt">{cfg.setting}</p>
      <ol className="scenario-log shack-well" aria-label={logLabel}>
        {cfg.turns.slice(0, turn).map((t, i) => (
          <li key={i}>
            <p className="scenario-situation">{t.situation}</p>
            <p className="scenario-said">{t.options[picks[i]!]!.text}</p>
          </li>
        ))}
        {current && (
          <li aria-current="step">
            <p className="scenario-situation">{current.situation}</p>
          </li>
        )}
      </ol>
      {current ? (
        <div className="control">
          <span className="control-label" id="scenario-q">
            What do you do? ({turn + 1} of {cfg.turns.length})
          </span>
          <div className="scenario-options" role="group" aria-labelledby="scenario-q">
            {current.options.map((o, i) => (
              <button
                key={i}
                type="button"
                className="chip scenario-option"
                aria-pressed={pick === i}
                disabled={demo}
                onClick={() => setPicks((ps) => [...ps.slice(0, turn), i])}
              >
                {o.text}
              </button>
            ))}
          </div>
          <p className="lab-hint" role="status">
            {chosen && !chosen.correct && chosen.feedback}
          </p>
        </div>
      ) : (
        <p className="lab-success" role="status">
          {cfg.turns.at(-1)!.options.find((o) => o.correct)!.feedback}
        </p>
      )}
      <Readouts items={[["Progress", `${turn} of ${cfg.turns.length}`]]} />
    </div>
  );
}

/** LAB-07 Virtual QSO Simulator. */
export function QsoLab(props: LabBodyProps) {
  return <ScenarioBody {...props} logLabel="Contact log" />;
}

/** LAB-11 Emergency Net Scenario. */
export function EmergencyNetLab(props: LabBodyProps) {
  return <ScenarioBody {...props} logLabel="Net log" />;
}
