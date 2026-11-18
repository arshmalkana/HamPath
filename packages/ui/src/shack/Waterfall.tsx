"use client";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";

export interface WaterfallSignal {
  hz: number;
  /** Occupied bandwidth, Hz. */
  width: number;
  /** 0..1 */
  strength: number;
  label?: string;
}

export interface WaterfallProps {
  label: string;
  centerHz: number;
  spanHz: number;
  signals: WaterfallSignal[];
  /** Optional tuning cursor; with onTune the display becomes a keyboard slider. */
  tunedHz?: number;
  onTune?: (hz: number) => void;
  tuneStepHz?: number;
}

const fmtMHz = (hz: number) => `${(hz / 1e6).toFixed(3)} MHz`;

/**
 * Scrolling waterfall: frequency across, time down, brightness = signal strength.
 * Colours come from the shack tokens at runtime. A text list of the signals is always present
 * for screen readers; with prefers-reduced-motion the display is drawn once and holds still.
 */
export function Waterfall({ label, centerHz, spanHz, signals, tunedHz, onTune, tuneStepHz = 100 }: WaterfallProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const descId = useId();
  const lo = centerHz - spanHz / 2;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const css = getComputedStyle(el);
    const ground = css.getPropertyValue("--shack-readout-ground").trim();
    const ink = css.getPropertyValue("--shack-readout").trim();
    const cursor = css.getPropertyValue("--shack-lamp").trim();
    const W = (el.width = Math.max(200, Math.round(el.clientWidth)));
    const H = (el.height = 160);
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, W, H);

    const row = (y: number) => {
      ctx.fillStyle = ground;
      ctx.fillRect(0, y, W, 1);
      ctx.fillStyle = ink;
      for (let x = 0; x < W; x++) {
        const hz = lo + (x / W) * spanHz;
        let p = Math.random() * 0.12; // band noise
        for (const s of signals) {
          const d = (hz - s.hz) / Math.max(1, s.width / 2);
          if (Math.abs(d) < 3) p += s.strength * Math.exp(-d * d) * (0.75 + Math.random() * 0.25);
        }
        if (p > 0.02) {
          ctx.globalAlpha = Math.min(1, p);
          ctx.fillRect(x, y, 1, 1);
        }
      }
      ctx.globalAlpha = 1;
    };
    const drawCursor = () => {
      if (tunedHz === undefined) return;
      const x = Math.round(((tunedHz - lo) / spanHz) * W);
      ctx.fillStyle = cursor;
      ctx.fillRect(x, 0, 1, H);
    };

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) {
      for (let y = 0; y < H; y++) row(y);
      drawCursor();
      return;
    }
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 66) return; // ~15 rows a second
      last = t;
      ctx.drawImage(el, 0, 0, W, H - 1, 0, 1, W, H - 1);
      row(0);
      drawCursor();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lo, spanHz, signals, tunedHz]);

  const onKey = (e: KeyboardEvent) => {
    if (!onTune || tunedHz === undefined) return;
    const map: Record<string, number> = {
      ArrowRight: tunedHz + tuneStepHz,
      ArrowUp: tunedHz + tuneStepHz,
      ArrowLeft: tunedHz - tuneStepHz,
      ArrowDown: tunedHz - tuneStepHz,
      PageUp: tunedHz + tuneStepHz * 10,
      PageDown: tunedHz - tuneStepHz * 10,
      Home: lo,
      End: lo + spanHz,
    };
    if (e.key in map) {
      e.preventDefault();
      onTune(Math.min(lo + spanHz, Math.max(lo, map[e.key]!)));
    }
  };
  const tunable = Boolean(onTune && tunedHz !== undefined);
  const near = tunedHz === undefined ? undefined : signals.find((s) => Math.abs(s.hz - tunedHz) <= s.width / 2);

  return (
    <div className="waterfall">
      <div
        className="waterfall-tune"
        {...(tunable
          ? {
              role: "slider",
              tabIndex: 0,
              "aria-label": `${label} tuning`,
              "aria-valuemin": lo,
              "aria-valuemax": lo + spanHz,
              "aria-valuenow": tunedHz,
              "aria-valuetext": `${fmtMHz(tunedHz!)}${near ? `, on ${near.label ?? "a signal"}` : ""}`,
              onKeyDown: onKey,
            }
          : { role: "img", "aria-label": label })}
        aria-describedby={descId}
      >
        <canvas ref={canvas} className="waterfall-canvas" aria-hidden="true" />
      </div>
      <div className="waterfall-scale" aria-hidden="true">
        <span>{fmtMHz(lo)}</span>
        <span>{fmtMHz(centerHz)}</span>
        <span>{fmtMHz(lo + spanHz)}</span>
      </div>
      <p id={descId} className="visually-hidden">
        {signals.length
          ? `Signals: ${signals.map((s) => `${s.label ?? "signal"} at ${fmtMHz(s.hz)}, ${s.strength > 0.6 ? "strong" : s.strength > 0.3 ? "moderate" : "weak"}`).join("; ")}.`
          : "No signals."}
      </p>
    </div>
  );
}
