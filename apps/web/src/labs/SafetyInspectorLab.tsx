"use client";
import { useState } from "react";
import { inspectorVariables, type InspectorConfig, type InspectorState } from "@hampath/ham-sim";
import type { LabBodyProps } from "./registry";
import { Readouts, useReport } from "./common";

interface Config extends InspectorConfig {
  scene: string;
}

/** LAB-16 Safe Shack Inspector: walk through a scene and mark each thing safe or a hazard. */
export function SafetyInspectorLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const demo = mode === "demo";
  const [verdicts, setVerdicts] = useState<InspectorState["verdicts"]>({});
  const state: InspectorState = { verdicts };
  const v = inspectorVariables(state, cfg)!;
  useReport(onState, v, state as unknown as Record<string, unknown>, [verdicts]);

  return (
    <div className="lab">
      <p className="lab-prompt">{cfg.scene}</p>
      <ul className="inspect-list">
        {cfg.items.map((it) => {
          const got = verdicts[it.id];
          const right = got ? (got === "hazard") === it.hazard : null;
          return (
            <li
              key={it.id}
              className="inspect-item shack-well"
              data-state={right === null ? undefined : right ? "right" : "wrong"}
            >
              <p className="inspect-label">{it.label}</p>
              <div className="chip-row" role="group" aria-label={`Verdict: ${it.label}`}>
                {(["safe", "hazard"] as const).map((x) => (
                  <button
                    key={x}
                    type="button"
                    className="chip"
                    aria-pressed={got === x}
                    disabled={demo}
                    onClick={() => setVerdicts((cur) => ({ ...cur, [it.id]: x }))}
                  >
                    {x === "safe" ? "Safe" : "Hazard"}
                  </button>
                ))}
              </div>
              <p className="inspect-why" role="status">
                {right !== null && (right ? `Right. ${it.why}` : "Look again.")}
              </p>
            </li>
          );
        })}
      </ul>
      <Readouts
        items={[
          ["Judged correctly", `${v.correct} of ${v.total}`],
          ["Hazards found", `${v.hazardsFound} of ${v.hazards}`],
        ]}
      />
    </div>
  );
}
