"use client";
import { useState } from "react";
import {
  CALL_REGIONS,
  ID_INTERVAL_MIN,
  callSignVariables,
  idTimingVariables,
  type CallSignConfig,
  type CallSignState,
  type IdTimingConfig,
} from "@hampath/ham-sim";
import type { LabBodyProps } from "./registry";
import { Readouts, SegChoice, Stepper, useReport } from "./common";

interface BuildConfig extends CallSignConfig {
  prefixes: string[];
  start: CallSignState;
}

function BuildBody({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as BuildConfig;
  const demo = mode === "demo";
  const [s, setS] = useState<CallSignState>(cfg.start);
  const v = callSignVariables(s, cfg)!;
  useReport(onState, v, s as unknown as Record<string, unknown>, [s]);
  const set = <K extends keyof CallSignState>(k: K, x: CallSignState[K]) => setS((cur) => ({ ...cur, [k]: x }));
  const call = `${s.prefix}${s.digit}${s.suffix}`;
  const region = CALL_REGIONS[`${s.prefix}${s.digit}`];
  const status = !v.canadian
    ? `${s.prefix} isn't a Canadian prefix. Canadian calls start with VA, VE, VO or VY.`
    : !region
      ? `${s.prefix}${s.digit} isn't assigned to a province or territory.`
      : !v.suffixOk
        ? "The suffix should be two or three letters."
        : v.regionOk
          ? `${call}: a valid call sign for ${region}.`
          : `${call} is valid, but it's a ${region} call, not ${cfg.region}.`;

  return (
    <div className="lab">
      <p className="lab-prompt">Make a call sign for an amateur in {cfg.region}.</p>
      <div className="shack-well" style={{ display: "grid", placeItems: "center" }}>
        <p className="drill-prompt" aria-live="polite">
          {call || "–"}
        </p>
      </div>
      <div className="knobs">
        <SegChoice
          label="Prefix"
          value={s.prefix}
          onChange={(x) => set("prefix", x)}
          disabled={demo}
          options={cfg.prefixes.map((p) => ({ value: p, label: p }))}
        />
        <Stepper
          label="Digit"
          values={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]}
          value={Number(s.digit)}
          onChange={(x) => set("digit", String(x))}
          format={String}
          disabled={demo}
        />
        <label className="control">
          <span className="control-label">Suffix</span>
          <input
            className="input callsign-input"
            value={s.suffix}
            maxLength={3}
            disabled={demo}
            onChange={(e) => set("suffix", e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
          />
        </label>
      </div>
      <Readouts
        items={[
          ["Country", v.canadian ? "Canada" : "not Canada"],
          ["Region", region ?? "–"],
        ]}
      />
      <p className="lab-state" role="status">
        {status}
      </p>
    </div>
  );
}

function TimingBody({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as IdTimingConfig;
  const demo = mode === "demo";
  const [ids, setIds] = useState<number[]>([]);
  const v = idTimingVariables({ ids }, cfg)!;
  useReport(onState, v, { ids }, [ids]);
  const marks = Array.from({ length: cfg.duration / 5 + 1 }, (_, i) => i * 5);
  const toggle = (m: number) => setIds((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  const sorted = [...ids].sort((a, b) => a - b);

  return (
    <div className="lab">
      <p className="lab-prompt">A {cfg.duration}-minute contact. Mark every time you give your call sign.</p>
      <div className="shack-well">
        <svg
          viewBox="0 0 520 60"
          role="img"
          aria-label={`Identification at ${sorted.length ? sorted.join(", ") : "no"} minutes. Longest gap ${v.maxGap} minutes.`}
        >
          <path className="iono-ground" d="M10,30 H510" />
          {sorted.map((m, i) =>
            i ? (
              <rect
                key={m}
                className={m - sorted[i - 1]! > ID_INTERVAL_MIN ? "id-gap id-gap-bad" : "id-gap"}
                x={10 + (sorted[i - 1]! / cfg.duration) * 500}
                y="24"
                width={((m - sorted[i - 1]!) / cfg.duration) * 500}
                height="12"
              />
            ) : null,
          )}
          {sorted.map((m) => (
            <circle key={m} className="feed-point" cx={10 + (m / cfg.duration) * 500} cy="30" r="6" />
          ))}
        </svg>
      </div>
      <div className="chip-row" role="group" aria-label="Minutes into the contact">
        {marks.map((m) => (
          <button
            key={m}
            type="button"
            className="chip"
            aria-pressed={ids.includes(m)}
            disabled={demo}
            onClick={() => toggle(m)}
          >
            {m} min
          </button>
        ))}
      </div>
      <Readouts
        items={[
          ["Longest gap", `${v.maxGap} min`],
          ["At start and end", v.atStart && v.atEnd ? "yes" : "no"],
        ]}
      />
      <p className="lab-state" role="status">
        {v.idOk
          ? "Legal: at the start, at the end, and never more than 30 minutes apart."
          : !v.atStart
            ? "Identify at the start of the contact."
            : !v.atEnd
              ? "Identify at the end too."
              : "There's a gap longer than 30 minutes."}
      </p>
    </div>
  );
}

/** LAB-03 Call Sign Builder: Canadian call signs, and when to identify. */
export function CallSignLab(props: LabBodyProps) {
  return (props.config as { mode?: string }).mode === "timing" ? <TimingBody {...props} /> : <BuildBody {...props} />;
}
