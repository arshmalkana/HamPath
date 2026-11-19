"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { formatQuantity, type Unit, type Vars } from "@hampath/ham-sim";
import { Knob } from "@hampath/ui";

export const fmt = (v: number, u: Unit | "", sig = 3) => formatQuantity(v, u as Unit, sig);

/** A value with a real word in it ("uncontrolled", "about 20 dB weaker") rather than a number and unit. */
const isWords = (v: ReactNode) => typeof v === "string" && (/[A-Za-z]{5,}/.test(v) || v.length > 14);

/** Labelled instrument readouts; also the screen-reader text equivalent of every meter. */
export function Readouts({ items, label = "Readouts" }: { items: [string, ReactNode][]; label?: string }) {
  return (
    <dl className="readouts-row" aria-label={label}>
      {items.map(([k, v]) => (
        <div key={k} className="readout-cell">
          <dt>{k}</dt>
          {/* Words get a smaller face that wraps; digits keep the big seven-segment look. */}
          <dd className="readout" data-kind={isWords(v) ? "text" : undefined}>
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Step through a fixed list of values with − / + buttons (keyboard and screen-reader friendly). */
export function Stepper<T extends number>({
  label,
  values,
  value,
  onChange,
  format,
  disabled,
}: {
  label: string;
  values: readonly T[];
  value: T;
  onChange: (v: T) => void;
  format: (v: T) => string;
  disabled?: boolean;
}) {
  const i = Math.max(0, values.indexOf(value));
  return (
    <div className="control">
      <span className="control-label" id={`stp-${label}`}>
        {label}
      </span>
      <div className="stepper" role="group" aria-labelledby={`stp-${label}`}>
        <button
          type="button"
          className="stepper-btn"
          aria-label={`Decrease ${label}`}
          disabled={disabled || i === 0}
          onClick={() => onChange(values[i - 1]!)}
        >
          −
        </button>
        <output className="stepper-value" aria-live="polite">
          {format(value)}
        </output>
        <button
          type="button"
          className="stepper-btn"
          aria-label={`Increase ${label}`}
          disabled={disabled || i === values.length - 1}
          onClick={() => onChange(values[i + 1]!)}
        >
          +
        </button>
      </div>
    </div>
  );
}

/** Two to four mutually exclusive options (a WAI-ARIA radio group). */
export function SegChoice<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="control">
      <span className="control-label" id={`seg-${label}`}>
        {label}
      </span>
      <div className="seg-choice" role="radiogroup" aria-labelledby={`seg-${label}`}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              const idx = options.findIndex((x) => x.value === value);
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                onChange(options[(idx + 1) % options.length]!.value);
              }
              if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                onChange(options[(idx - 1 + options.length) % options.length]!.value);
              }
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Knob over a logarithmic range (frequency, capacitance…): 10 steps per decade,
 * snapping to 1-2-5-style readable values is left to the caller's format.
 */
export function LogKnob({
  label,
  value,
  min,
  max,
  onChange,
  format,
  disabled,
  stepsPerDecade = 20,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  disabled?: boolean;
  stepsPerDecade?: number;
}) {
  const lmin = Math.log10(min);
  const lmax = Math.log10(max);
  const steps = Math.round((lmax - lmin) * stepsPerDecade);
  const pos = Math.round(((Math.log10(value) - lmin) / (lmax - lmin)) * steps);
  const toValue = (p: number) => Number((10 ** (lmin + ((lmax - lmin) * p) / steps)).toPrecision(3));
  return (
    <Knob
      label={label}
      value={pos}
      min={0}
      max={steps}
      step={1}
      disabled={disabled}
      onChange={(p) => onChange(toValue(p))}
      format={() => format(value)}
    />
  );
}

/** Report vars/state to the lab frame whenever the inputs change. */
export function useReport(
  onState: (v: Vars, s: Record<string, unknown>) => void,
  vars: Vars | null,
  state: Record<string, unknown>,
  deps: unknown[],
) {
  const ref = useRef(onState);
  useEffect(() => {
    ref.current = onState;
  });
  useEffect(() => {
    if (vars) ref.current(vars, state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
