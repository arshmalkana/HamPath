"use client";
import { useState } from "react";
import {
  PREFIX_EXPONENTS,
  SI_PREFIXES,
  parseQuantity,
  roundSig,
  unitSliderVariables,
  type Unit,
} from "@hampath/ham-sim";
import type { LabBodyProps } from "./registry";
import { Readouts, useReport } from "./common";

interface Config {
  /** The quantity to restate, e.g. "3.525 MHz". */
  quantity: string;
  unit: Unit;
  startExp?: number;
}

const UNIT_WORD: Partial<Record<Unit, string>> = {
  Hz: "hertz",
  A: "amperes",
  V: "volts",
  W: "watts",
  Ω: "ohms",
  F: "farads",
  H: "henries",
};

/** Spell a number without exponent notation: 3525 → "3 525", 0.0025 → "0.0025". */
function plain(x: number): string {
  const r = roundSig(x, 6);
  const [int, frac] = r.toFixed(Math.max(0, Math.min(15, 6 - Math.floor(Math.log10(Math.abs(r) || 1)) - 1))).split(".");
  const intSpaced = int!.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const fracTrim = frac?.replace(/0+$/, "");
  return fracTrim ? `${intSpaced}.${fracTrim}` : intSpaced;
}

/** LAB-19 Unit Slider: the same quantity, every metric prefix from pico to giga. */
export function UnitSliderLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const base = parseQuantity(cfg.quantity, cfg.unit)?.value ?? 0;
  const [exp, setExp] = useState<number>(cfg.startExp ?? 0);
  const vars = unitSliderVariables({ exp }, cfg);
  useReport(onState, vars, { exp }, [exp]);
  const prefix = SI_PREFIXES.find((p) => p.exp === exp)!;
  const mantissa = base / 10 ** exp;
  const demo = mode === "demo";

  return (
    <div className="lab">
      <p className="big-readout" aria-live="polite">
        {plain(mantissa)} {prefix.symbol}
        {cfg.unit}
      </p>
      <div className="prefix-ruler" role="radiogroup" aria-label="Metric prefix">
        {PREFIX_EXPONENTS.map((e) => {
          const p = SI_PREFIXES.find((x) => x.exp === e)!;
          return (
            <button
              key={e}
              type="button"
              role="radio"
              className="prefix-stop"
              aria-checked={e === exp}
              disabled={demo}
              aria-label={`${p.name || "no prefix"}: ${plain(base / 10 ** e)} ${p.symbol}${cfg.unit}`}
              onClick={() => setExp(e)}
              onKeyDown={(ev) => {
                const i = PREFIX_EXPONENTS.indexOf(exp as never);
                if (ev.key === "ArrowRight") {
                  ev.preventDefault();
                  setExp(PREFIX_EXPONENTS[Math.min(7, i + 1)]!);
                }
                if (ev.key === "ArrowLeft") {
                  ev.preventDefault();
                  setExp(PREFIX_EXPONENTS[Math.max(0, i - 1)]!);
                }
              }}
            >
              <span>
                {p.symbol || "–"}
                {cfg.unit}
              </span>
              <span className="prefix-name">{p.name || "base"}</span>
            </button>
          );
        })}
      </div>
      <Readouts
        items={[
          ["Same amount in base units", `${plain(base)} ${cfg.unit}`],
          ["Prefix", prefix.name ? `${prefix.name} = 10^${exp}` : "none (10^0)"],
          ["In words", `${plain(mantissa)} ${prefix.name}${UNIT_WORD[cfg.unit] ?? cfg.unit}`],
        ]}
      />
      <p className="lab-state">Each step is ×1000 or ÷1000: the decimal point moves 3 places.</p>
    </div>
  );
}
