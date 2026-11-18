"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { evaluateGoal, type Vars } from "@hampath/ham-sim";
import { Button } from "@hampath/ui";
import { findLab, type LabMode } from "./registry";

export type LabEventName = "started" | "goal_met" | "hint_used" | "value_changed";

export interface LabConfig {
  /** The lesson's lab-step id (e.g. "5.04/explore-current"); events are recorded against it. */
  stepId?: string;
  prompt?: string;
  /** Starting values, locked controls, lab options: default_config merged with the step's overrides. */
  config: Record<string, unknown>;
  /** ham-sim goal expression over the lab's variables, e.g. "swr <= 1.2". */
  goal?: string | null;
  goalText?: string | null;
  hints?: string[];
  success?: string | null;
}

export interface LabProps {
  id: string;
  config: LabConfig;
  mode: LabMode;
  onEvent?: (event: LabEventName, payload: Record<string, unknown>) => void;
  /** Called once when the goal is first met (or when there is no goal, immediately). */
  onGoalMet?: () => void;
  /** Called when every hint has been shown, so the lesson can let the learner move on. */
  onHintsExhausted?: () => void;
}

/**
 * The lab frame (SPEC §4 contract): renders the lab body from the registry on the shack panel,
 * checks the goal live, offers hints, and emits started / value_changed / hint_used / goal_met.
 * The API re-checks goal_met from the reported inputs and advances the lesson step.
 */
export function Lab({ id, config, mode, onEvent, onGoalMet, onHintsExhausted }: LabProps) {
  const entry = findLab(id);
  const [met, setMet] = useState(!config.goal);
  const [hintsShown, setHintsShown] = useState(0);
  const latest = useRef<{ vars: Vars; state: Record<string, unknown> } | null>(null);
  const metRef = useRef(!config.goal);
  const changeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hints = config.hints ?? [];

  useEffect(() => {
    onEvent?.("started", {});
    if (!config.goal) onGoalMet?.();
    return () => clearTimeout(changeTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onState = useCallback(
    (vars: Vars, state: Record<string, unknown>) => {
      latest.current = { vars, state };
      clearTimeout(changeTimer.current);
      changeTimer.current = setTimeout(() => onEvent?.("value_changed", { state }), 1500);
      if (mode === "demo" || metRef.current || !config.goal) return;
      let ok = false;
      try {
        ok = evaluateGoal(config.goal, vars);
      } catch {
        ok = false;
      }
      if (ok) {
        metRef.current = true;
        setMet(true);
        onEvent?.("goal_met", { state, vars });
        onGoalMet?.();
      }
    },
    [config.goal, mode, onEvent, onGoalMet],
  );

  const showHint = () => {
    const n = Math.min(hints.length, hintsShown + 1);
    setHintsShown(n);
    onEvent?.("hint_used", { hint: n });
    if (n === hints.length) onHintsExhausted?.();
  };

  const Body = entry?.component;
  return (
    <section className="shack shack-panel lab" aria-label={`${entry?.name ?? id} (${id})`}>
      {(config.prompt || config.goalText) && (
        <div className="lab-task">
          {config.prompt && <p className="lab-prompt">{config.prompt}</p>}
          {config.goal && config.goalText && (
            <span className="lab-goal" data-met={met}>
              {met ? "Done: " : "Goal: "}
              {config.goalText}
            </span>
          )}
        </div>
      )}
      {Body ? (
        <Body config={config.config} mode={mode} onState={onState} />
      ) : (
        <div className="lab-placeholder shack-well">
          <p className="lab-prompt">{entry?.name ?? id}</p>
          <p className="lab-hint">This lab is being built. The lesson works without it: carry on to the cards.</p>
        </div>
      )}
      {(hints.length > 0 || (met && config.goal)) && (
        <div className="lab-foot" aria-live="polite">
          <div>
            {met && config.goal ? (
              <p className="lab-success">{config.success ?? "Goal reached."}</p>
            ) : (
              hints.slice(0, hintsShown).map((h, i) => (
                <p key={i} className="lab-hint">
                  Hint {i + 1}: {h}
                </p>
              ))
            )}
          </div>
          {!met && hintsShown < hints.length && (
            <Button variant="quiet" onClick={showHint}>
              {hintsShown === 0 ? "Hint" : "Another hint"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
