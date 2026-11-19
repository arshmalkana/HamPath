"use client";
import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { SWEEP, moveDrag, startDrag, type KnobDrag } from "./knobDrag";

export interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  /** Text for the value, read by screen readers and shown under the knob. */
  format?: (v: number) => string;
  disabled?: boolean;
  size?: number;
}

/**
 * Front-panel rotary knob. A WAI-ARIA slider: arrows step, Page Up/Down step ×10, Home/End jump.
 * With a pointer, turn it around its centre like a dial, or drag up/right from the middle like a
 * slider (see knobDrag.ts); the − / + buttons step it for pointers that can't drag (WCAG 2.5.7).
 * The value is announced through aria-valuetext.
 */
export function Knob({ label, value, min, max, step, onChange, format = String, disabled, size = 88 }: KnobProps) {
  const drag = useRef<KnobDrag | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const set = (v: number) => {
    const c = Number(clamp(v).toFixed(10));
    if (c !== value) onChange(c);
  };
  const frac = max === min ? 0 : (value - min) / (max - min);
  const angle = -SWEEP / 2 + frac * SWEEP;

  const onKey = (e: KeyboardEvent) => {
    if (disabled) return;
    const big = step * 10;
    const map: Record<string, number> = {
      ArrowUp: value + step,
      ArrowRight: value + step,
      ArrowDown: value - step,
      ArrowLeft: value - step,
      PageUp: value + big,
      PageDown: value - big,
      Home: min,
      End: max,
    };
    if (e.key in map) {
      e.preventDefault();
      set(map[e.key]!);
    }
  };
  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = startDrag(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY, value);
  };
  const onMove = (e: PointerEvent) => {
    if (!drag.current) return;
    set(moveDrag(drag.current, e.clientX, e.clientY, { min, max, step }));
  };
  const onUp = () => {
    drag.current = null;
  };

  const ticks = Array.from({ length: 11 }, (_, i) => -SWEEP / 2 + (i * SWEEP) / 10);
  return (
    <div className="knob">
      <svg
        className="knob-dial"
        viewBox="0 0 100 100"
        width={size}
        height={size}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        aria-disabled={disabled || undefined}
        onKeyDown={onKey}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {ticks.map((a) => (
          <line key={a} className="knob-tick" x1="50" y1="4" x2="50" y2="10" transform={`rotate(${a} 50 50)`} />
        ))}
        <circle className="knob-skirt" cx="50" cy="50" r="38" />
        <g className="knob-rotor" style={{ transform: `rotate(${angle}deg)` }}>
          <circle className="knob-body" cx="50" cy="50" r="32" />
          <line className="knob-pointer" x1="50" y1="24" x2="50" y2="38" />
        </g>
      </svg>
      <span className="knob-label" aria-hidden="true">
        {label}
      </span>
      <span className="knob-row" aria-hidden="true">
        <button
          type="button"
          className="knob-step"
          tabIndex={-1}
          disabled={disabled || value <= min}
          onClick={() => set(value - step)}
        >
          −
        </button>
        <span className="knob-value">{format(value)}</span>
        <button
          type="button"
          className="knob-step"
          tabIndex={-1}
          disabled={disabled || value >= max}
          onClick={() => set(value + step)}
        >
          +
        </button>
      </span>
    </div>
  );
}
