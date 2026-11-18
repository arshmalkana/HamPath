"use client";
import { useEffect, useRef, useState } from "react";
import {
  CAUSES,
  CURES,
  interferenceVariables,
  type Cause,
  type Cure,
  type InterferenceConfig,
  type InterferenceState,
} from "@hampath/ham-sim";
import type { LabBodyProps } from "./registry";
import { useReport } from "./common";

type Sound = "ssb-rect" | "cw-rect" | "overload" | "harmonic" | "intermod" | "clicks" | "desense" | "splatter";
interface Config extends InterferenceConfig {
  title: string;
  story: string;
  evidence: string[];
  sound: Sound;
  /** Text equivalent of the recording, always shown. */
  caption: string;
  causes: Cause[];
  cures: Cure[];
}

/** "CQ" in Morse as on/off segments (dit = 1 unit). */
const CQ = [3, 1, 1, 1, 3, 1, 1, 3, 3, 3, 3, 1, 1, 1, 3];

/** Synthesize a three-second "case recording" with WebAudio. */
function play(ctx: AudioContext, sound: Sound) {
  const t0 = ctx.currentTime + 0.05;
  const dur = 3;
  const out = ctx.createGain();
  out.gain.value = 0.18;
  out.connect(ctx.destination);
  const noise = () => {
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  };
  const tone = (f: number, type: OscillatorType = "sine") => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    return o;
  };
  const syllables = (g: GainNode, rate = 4) => {
    for (let i = 0; i < dur * rate; i++) {
      const t = t0 + i / rate;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.4 + 0.6 * Math.random(), t + 0.06);
      g.gain.linearRampToValueAtTime(0, t + 0.8 / rate);
    }
  };
  const morse = (g: GainNode, unit = 0.08, sharp = false) => {
    let t = t0;
    let on = true;
    for (const u of [...CQ, 7, ...CQ]) {
      if (on) {
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(1, t + (sharp ? 0.001 : 0.008));
        g.gain.setValueAtTime(1, t + u * unit);
        g.gain.linearRampToValueAtTime(0, t + u * unit + (sharp ? 0.001 : 0.008));
      }
      t += u * unit;
      on = !on;
    }
  };
  const nodes: AudioScheduledSourceNode[] = [];
  const env = ctx.createGain();
  env.gain.value = 0;
  env.connect(out);
  if (sound === "ssb-rect" || sound === "splatter") {
    const n = noise();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 700;
    bp.Q.value = sound === "splatter" ? 0.3 : 1.2;
    const shaper = ctx.createWaveShaper();
    shaper.curve = Float32Array.from({ length: 256 }, (_, i) => Math.tanh(((i - 128) / 128) * 6));
    n.connect(bp).connect(shaper).connect(env);
    syllables(env);
    nodes.push(n);
  } else if (sound === "cw-rect" || sound === "clicks") {
    const o = sound === "cw-rect" ? tone(120, "square") : tone(700);
    o.connect(env);
    morse(env, 0.08, sound === "clicks");
    nodes.push(o);
    if (sound === "clicks") {
      const n = noise();
      const g = ctx.createGain();
      g.gain.value = 0;
      n.connect(g).connect(out);
      morse(g, 0.08, true);
      nodes.push(n);
    }
  } else if (sound === "overload" || sound === "harmonic") {
    const n = noise();
    n.connect(env);
    if (sound === "harmonic") {
      const o = tone(60, "sawtooth");
      o.connect(env);
      nodes.push(o);
    }
    syllables(env, 2);
    nodes.push(n);
  } else if (sound === "intermod") {
    env.gain.value = 0.6;
    for (const [f, am] of [
      [700, 3],
      [1130, 5],
      [430, 7],
    ] as const) {
      const o = tone(f);
      const g = ctx.createGain();
      const lfo = tone(am);
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      lfo.connect(depth).connect(g.gain);
      g.gain.value = 0.5;
      o.connect(g).connect(env);
      nodes.push(o, lfo);
    }
  } else if (sound === "desense") {
    const o = tone(440, "triangle");
    o.connect(env);
    env.gain.setValueAtTime(0.8, t0);
    env.gain.setValueAtTime(0.8, t0 + 1);
    env.gain.linearRampToValueAtTime(0.08, t0 + 1.05);
    env.gain.setValueAtTime(0.08, t0 + 2.2);
    env.gain.linearRampToValueAtTime(0.8, t0 + 2.25);
    nodes.push(o);
  }
  for (const n of nodes) {
    n.start(t0);
    n.stop(t0 + dur);
  }
}

/** LAB-33 Interference Detective: read the case file, listen, diagnose, then cure. */
export function InterferenceLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const demo = mode === "demo";
  const [diagnosis, setDiagnosis] = useState<Cause | null>(null);
  const [cure, setCure] = useState<Cure | null>(null);
  const state: InterferenceState = { diagnosis, cure };
  const v = interferenceVariables(state, cfg)!;
  useReport(onState, v, state as unknown as Record<string, unknown>, [diagnosis, cure]);
  const ctx = useRef<AudioContext | null>(null);
  useEffect(() => () => void ctx.current?.close().catch(() => {}), []);
  const listen = () => {
    try {
      ctx.current ??= new AudioContext();
      play(ctx.current, cfg.sound);
    } catch {
      /* audio unavailable: the caption carries the same information */
    }
  };

  return (
    <div className="lab">
      <div className="shack-well case-file">
        <p className="case-title">{cfg.title}</p>
        <p className="inspect-label">{cfg.story}</p>
        <ul className="case-evidence">
          {cfg.evidence.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
        <div className="case-audio">
          <button type="button" className="chip" onClick={listen}>
            Play the recording
          </button>
          <p className="lab-state">What you hear: {cfg.caption}</p>
        </div>
      </div>
      <div className="control">
        <span className="control-label" id="diag-label">
          1. What's causing it?
        </span>
        <div className="chip-row" role="group" aria-labelledby="diag-label">
          {cfg.causes.map((k) => (
            <button
              key={k}
              type="button"
              className="chip"
              aria-pressed={diagnosis === k}
              disabled={demo || Boolean(v.diagnosed)}
              onClick={() => setDiagnosis(k)}
            >
              {CAUSES[k]}
            </button>
          ))}
        </div>
        {diagnosis && (
          <p className={v.diagnosed ? "lab-success" : "lab-hint"} role="status">
            {v.diagnosed ? "That fits the evidence." : "That doesn't fit all the evidence. Look again."}
          </p>
        )}
      </div>
      {v.diagnosed && (
        <div className="control">
          <span className="control-label" id="cure-label">
            2. What will fix it?
          </span>
          <div className="chip-row" role="group" aria-labelledby="cure-label">
            {cfg.cures.map((k) => (
              <button
                key={k}
                type="button"
                className="chip"
                aria-pressed={cure === k}
                disabled={demo || Boolean(v.cured)}
                onClick={() => setCure(k)}
              >
                {CURES[k]}
              </button>
            ))}
          </div>
          {cure && (
            <p className={v.cured ? "lab-success" : "lab-hint"} role="status">
              {v.cured ? "Case closed." : "That won't cure this cause. Try another."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
