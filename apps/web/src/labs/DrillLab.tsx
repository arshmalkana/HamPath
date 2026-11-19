"use client";
import { useEffect, useRef, useState } from "react";
import {
  drillChoices,
  drillVariables,
  morseTiming,
  toMorse,
  type DrillConfig,
  type DrillState,
} from "@hampath/ham-sim";
import type { LabBodyProps } from "./registry";
import { Readouts, useReport } from "./common";

export interface DrillBodyConfig extends DrillConfig {
  /** The question shown with each prompt, e.g. "What's the phonetic for…". */
  question: string;
  /** Play the prompt as Morse instead of showing it. */
  morse?: { wpm: number };
}

/** Play text as Morse with a 700 Hz WebAudio tone. */
function playMorse(ctx: AudioContext, text: string, wpm: number) {
  const { tones } = morseTiming(text, wpm);
  const t0 = ctx.currentTime + 0.05;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.connect(ctx.destination);
  const o = ctx.createOscillator();
  o.frequency.value = 700;
  o.connect(g);
  for (const t of tones) {
    g.gain.setValueAtTime(0, t0 + t.start);
    g.gain.linearRampToValueAtTime(0.15, t0 + t.start + 0.005);
    g.gain.setValueAtTime(0.15, t0 + t.start + t.duration - 0.005);
    g.gain.linearRampToValueAtTime(0, t0 + t.start + t.duration);
  }
  const end = tones.length ? tones.at(-1)!.start + tones.at(-1)!.duration : 0;
  o.start(t0);
  o.stop(t0 + end + 0.1);
}

/** Multiple-choice drill: one prompt at a time, first answer counts. */
export function DrillBody({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as DrillBodyConfig;
  const demo = mode === "demo";
  const [answers, setAnswers] = useState<DrillState["answers"]>({});
  const [index, setIndex] = useState(0);
  const [showCode, setShowCode] = useState(false);
  const state: DrillState = { answers };
  const v = drillVariables(state, cfg)!;
  useReport(onState, v, state as unknown as Record<string, unknown>, [answers]);
  const ctx = useRef<AudioContext | null>(null);
  useEffect(() => () => void ctx.current?.close().catch(() => {}), []);

  const item = cfg.items[index % cfg.items.length]!;
  const given = answers[item.id];
  const choices = drillChoices(cfg, index % cfg.items.length);
  const play = () => {
    if (!cfg.morse) return;
    try {
      ctx.current ??= new AudioContext();
      playMorse(ctx.current, item.prompt, cfg.morse.wpm);
    } catch {
      setShowCode(true);
    }
  };
  const next = () => {
    setShowCode(false);
    if (Object.keys(answers).length >= cfg.items.length && !v.done) {
      setAnswers({});
      setIndex(0);
    } else setIndex((i) => i + 1);
  };

  return (
    <div className="lab">
      <div className="shack-well drill-card">
        <p className="shack-label">{cfg.question}</p>
        {cfg.morse ? (
          <div className="case-audio">
            <button type="button" className="chip" onClick={play} disabled={demo}>
              Play
            </button>
            <button type="button" className="chip" aria-pressed={showCode} onClick={() => setShowCode((x) => !x)}>
              Show dots and dashes
            </button>
            {showCode && <p className="drill-code">{toMorse(item.prompt)}</p>}
          </div>
        ) : (
          <p className="drill-prompt">{item.prompt}</p>
        )}
      </div>
      <div className="scenario-options" role="group" aria-label="Answers">
        {choices.map((c) => (
          <button
            key={c}
            type="button"
            className="chip scenario-option"
            aria-pressed={given === c}
            disabled={demo || given !== undefined}
            onClick={() => setAnswers((a) => ({ ...a, [item.id]: c }))}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="lab-foot">
        <p className={given === item.answer ? "lab-success" : "lab-hint"} role="status">
          {given !== undefined && (given === item.answer ? "Right." : `Not quite: ${item.prompt} is “${item.answer}”.`)}
        </p>
        {given !== undefined && !v.done && (
          <button type="button" className="btn btn-primary" onClick={next} disabled={demo}>
            Next question
          </button>
        )}
      </div>
      <Readouts items={[["Right", `${v.correct} of ${cfg.target} needed`]]} />
    </div>
  );
}

/** LAB-09 Phonetic & Q-Code Trainer. */
export function PhoneticLab(props: LabBodyProps) {
  return <DrillBody {...props} />;
}
