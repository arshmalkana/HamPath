"use client";
import { useEffect, useRef, useState } from "react";
import { MORSE, keyerVariables, type KeyerConfig, type KeyerState } from "@hampath/ham-sim";
import type { LabBodyProps } from "./registry";
import { Readouts, SegChoice, useReport } from "./common";

interface Config extends KeyerConfig {
  mode: "keyer";
  keyer: boolean;
  controls: { keyer: boolean };
}

/** Straight-key dit length (ms): slow enough to send by hand. */
const DIT_MS = 180;
const DECODE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

/** Short WebAudio sidetone; silent where audio isn't available. */
function useSidetone() {
  const ctx = useRef<AudioContext | null>(null);
  const osc = useRef<OscillatorNode | null>(null);
  const start = () => {
    try {
      ctx.current ??= new AudioContext();
      const o = ctx.current.createOscillator();
      const g = ctx.current.createGain();
      o.frequency.value = 700;
      g.gain.value = 0.08;
      o.connect(g).connect(ctx.current.destination);
      o.start();
      osc.current = o;
    } catch {
      /* no audio */
    }
  };
  const stop = () => {
    try {
      osc.current?.stop();
    } catch {
      /* already stopped */
    }
    osc.current = null;
  };
  useEffect(() => () => void ctx.current?.close().catch(() => {}), []);
  return { start, stop };
}

/** LAB-10 Morse Trainer. Keyer mode (lesson 3.14): straight key versus electronic keyer. */
export function MorseLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const demo = mode === "demo";
  const [keyer, setKeyer] = useState(cfg.keyer);
  const [sent, setSent] = useState("");
  const [durations, setDurations] = useState<number[]>([]);
  const down = useRef<number | null>(null);
  const tone = useSidetone();
  const state: KeyerState = { keyer, sent, durations };
  const v = keyerVariables(state, cfg)!;
  useReport(onState, v, state as unknown as Record<string, unknown>, [keyer, sent, durations]);

  const add = (el: "." | "-", d: number) => {
    setSent((s) => s + el);
    setDurations((ds) => [...ds, d]);
  };
  const paddle = (el: "." | "-") => {
    add(el, el === "." ? 1 : 3);
    tone.start();
    setTimeout(tone.stop, el === "." ? 90 : 270);
  };
  const keyDown = () => {
    if (down.current !== null) return;
    down.current = performance.now();
    tone.start();
  };
  const keyUp = () => {
    if (down.current === null) return;
    const units = (performance.now() - down.current) / DIT_MS;
    down.current = null;
    tone.stop();
    add(units < 2 ? "." : "-", Number(units.toFixed(2)));
  };
  const reset = () => {
    setSent("");
    setDurations([]);
  };
  const letters = sent.trim().split(/\s+/).filter(Boolean);
  const decoded = letters.map((l) => DECODE[l] ?? "?").join("");
  let i = 0;
  const bars = sent.split("").map((ch, k) => {
    if (ch === " ") return <span key={k} className="morse-gap" aria-hidden="true" />;
    const d = durations[i++] ?? (ch === "." ? 1 : 3);
    return <span key={k} className="morse-bar" style={{ width: `${Math.min(6, d) * 14}px` }} aria-hidden="true" />;
  });

  return (
    <div className="lab">
      <p className="lab-prompt">
        Send: <strong>{cfg.target}</strong> (
        {cfg.target
          .split("")
          .map((c) => MORSE[c.toUpperCase()])
          .join(" ")}
        )
      </p>
      <div
        className="shack-well morse-tape"
        aria-label={`Sent so far: ${sent || "nothing"}${decoded ? `, reads ${decoded}` : ""}`}
        role="img"
      >
        {bars.length ? bars : <span className="shack-label">Nothing sent yet</span>}
      </div>
      <div className="knobs">
        {cfg.controls.keyer && (
          <SegChoice
            label="Key"
            value={keyer ? "keyer" : "straight"}
            onChange={(x) => {
              setKeyer(x === "keyer");
              reset();
            }}
            disabled={demo}
            options={[
              { value: "straight", label: "Straight key" },
              { value: "keyer", label: "Electronic keyer" },
            ]}
          />
        )}
        {keyer ? (
          <div className="control">
            <span className="control-label">Paddles</span>
            <div className="chip-row">
              <button type="button" className="chip" disabled={demo} onClick={() => paddle(".")}>
                Dit
              </button>
              <button type="button" className="chip" disabled={demo} onClick={() => paddle("-")}>
                Dah
              </button>
            </div>
          </div>
        ) : (
          <div className="control">
            <span className="control-label">Straight key (hold Space or press and hold)</span>
            <button
              type="button"
              className="chip morse-key"
              disabled={demo}
              onPointerDown={keyDown}
              onPointerUp={keyUp}
              onPointerLeave={keyUp}
              onKeyDown={(e) => {
                if (e.key === " " && !e.repeat) {
                  e.preventDefault();
                  keyDown();
                }
              }}
              onKeyUp={(e) => {
                if (e.key === " ") {
                  e.preventDefault();
                  keyUp();
                }
              }}
            >
              Key
            </button>
          </div>
        )}
        <div className="control">
          <span className="control-label">Spacing</span>
          <div className="chip-row">
            <button
              type="button"
              className="chip"
              disabled={demo || !sent || sent.endsWith(" ")}
              onClick={() => setSent((s) => s + " ")}
            >
              Next letter
            </button>
            <button type="button" className="chip" disabled={demo || !sent} onClick={reset}>
              Clear
            </button>
          </div>
        </div>
      </div>
      <Readouts
        items={[
          ["Reads", decoded || "–"],
          ["Worst timing error", keyer ? "0% (the keyer times it)" : `${Math.round((v.timingError as number) * 100)}%`],
        ]}
      />
      <p className="lab-state" role="status">
        {keyer
          ? "The electronic keyer makes every dit and dah exactly the right length; you only choose which."
          : "With a straight key, you time every dit and dah yourself. Uneven lengths make Morse hard to copy."}
      </p>
    </div>
  );
}
