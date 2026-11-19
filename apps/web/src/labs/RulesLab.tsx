"use client";
import { useState } from "react";
import { rulesVariables, type RulesConfig, type RulesState } from "@hampath/ham-sim";
import type { LabBodyProps } from "./registry";
import { Readouts, useReport } from "./common";

interface Config extends RulesConfig {
  /** Short framing line, e.g. "You're the station owner. Is each of these allowed?" */
  intro: string;
}

/** Where the rules come from, top to bottom. */
const HIERARCHY = [
  { name: "Radiocommunication Act", does: "gives the authority, sets offences and penalties" },
  { name: "Radiocommunication Regulations", does: "define the amateur radio service and its conditions" },
  { name: "RBR-4 Standards", does: "the operating rules: bands, power, identification" },
  { name: "ISED", does: "administers it all" },
];

/** LAB-02 Rules Navigator: judge each situation and see which document settles it. */
export function RulesLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const demo = mode === "demo";
  const [answers, setAnswers] = useState<RulesState["answers"]>({});
  const state: RulesState = { answers };
  const v = rulesVariables(state, cfg)!;
  useReport(onState, v, state as unknown as Record<string, unknown>, [answers]);
  const cited = new Set(cfg.cases.filter((k) => answers[k.id] === k.answer && k.source).map((k) => k.source));

  return (
    <div className="lab">
      <p className="lab-prompt">{cfg.intro}</p>
      <ol className="rules-ladder shack-well" aria-label="Where the rules come from">
        {HIERARCHY.map((h) => (
          <li key={h.name} data-cited={cited.has(h.name) || undefined}>
            <span className="rules-doc">{h.name}</span> <span className="shack-label">{h.does}</span>
          </li>
        ))}
      </ol>
      <ul className="inspect-list">
        {cfg.cases.map((k) => {
          const got = answers[k.id];
          const right = got ? got === k.answer : null;
          return (
            <li
              key={k.id}
              className="inspect-item shack-well"
              data-state={right === null ? undefined : right ? "right" : "wrong"}
            >
              <p className="inspect-label">{k.situation}</p>
              <div className="chip-row" role="group" aria-label={k.situation}>
                {k.options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    className="chip"
                    aria-pressed={got === o}
                    disabled={demo || right === true}
                    onClick={() => setAnswers((a) => ({ ...a, [k.id]: o }))}
                  >
                    {o}
                  </button>
                ))}
              </div>
              <p className="inspect-why" role="status">
                {right !== null &&
                  (right ? `Right. ${k.why}${k.source ? ` (${k.source})` : ""}` : "Not quite. Think again.")}
              </p>
            </li>
          );
        })}
      </ul>
      <Readouts items={[["Settled", `${v.correct} of ${v.total}`]]} />
    </div>
  );
}
