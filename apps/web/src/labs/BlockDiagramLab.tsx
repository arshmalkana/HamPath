"use client";
import { Fragment, useState } from "react";
import { blockDiagramVariables, type DiagramConfig, type DiagramState } from "@hampath/ham-sim";
import { useDragDrop } from "@hampath/ui";
import type { LabBodyProps } from "./registry";
import { useReport } from "./common";

/** LAB-13 Block-Diagram Builder: drag stages into a station or radio chain, or pick the stage that does a job. */
export function BlockDiagramLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as DiagramConfig;
  const demo = mode === "demo";
  const identify = cfg.mode === "identify";
  const initial = cfg.slots.map((s) => (s.fixed || identify ? s.accepts : null));
  const [slots, setSlots] = useState<(string | null)[]>(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const state: DiagramState = { slots, selected };
  const v = blockDiagramVariables(state, cfg);
  useReport(onState, v, state as unknown as Record<string, unknown>, [slots, selected]);

  const block = (id: string | null | undefined) => cfg.blocks.find((b) => b.id === id);
  const place = (item: string, target: string) => {
    const i = Number(target.slice(5));
    if (cfg.slots[i]?.fixed) return;
    setSlots((cur) => cur.map((x, j) => (j === i ? item : x === item ? null : x)));
    setFocus(i);
  };
  const dnd = useDragDrop<string>(place);
  const used = new Set(slots.filter(Boolean));
  const tray = cfg.blocks.filter((b) => !used.has(b.id));

  const main = cfg.slots.map((s, i) => ({ s, i })).filter(({ s }) => s.feeds === undefined);
  const sides = (i: number) => cfg.slots.map((s, j) => ({ s, j })).filter(({ s }) => s.feeds === i);

  const slotView = (i: number) => {
    const s = cfg.slots[i]!;
    const id = slots[i];
    const b = block(id);
    const right = id === s.accepts;
    if (identify || s.fixed) {
      return (
        <button
          type="button"
          className="bd-block"
          data-state={identify ? (selected === id ? (id === cfg.target ? "right" : "wrong") : undefined) : "fixed"}
          aria-pressed={identify ? selected === id : undefined}
          disabled={demo || (!identify && s.fixed)}
          onClick={() => {
            if (identify && id) setSelected(id);
            setFocus(i);
          }}
        >
          {b?.label}
        </button>
      );
    }
    const t = dnd.targetProps(`slot-${i}`);
    const state = id ? (right ? "right" : "wrong") : undefined;
    return (
      <button
        type="button"
        className="bd-block bd-slot"
        data-drop-target={t["data-drop-target"]}
        data-over={t["data-over"]}
        data-state={state}
        disabled={demo}
        onClick={() => {
          if (!t.onClick() && id) setSlots((cur) => cur.map((x, j) => (j === i ? null : x)));
          setFocus(i);
        }}
        onKeyDown={t.onKeyDown}
        aria-label={`Stage ${i + 1}: ${b?.label ?? "empty"}${id ? (right ? ", correct" : ", not right here") : ""}`}
      >
        {b?.label ?? "Drop a stage here"}
      </button>
    );
  };

  const fb = focus !== null ? cfg.slots[focus] : null;
  const fBlock = focus !== null ? block(slots[focus]) : null;
  const pickedWrong = identify && selected && selected !== cfg.target ? block(selected) : null;

  return (
    <div className="lab">
      <div className="shack-well bd-diagram" role="group" aria-label="Block diagram">
        {cfg.input && <span className="bd-end">{cfg.input}</span>}
        {main.map(({ i }, k) => (
          <Fragment key={i}>
            {(k > 0 || cfg.input) && (
              <span className="bd-arrow" aria-hidden="true">
                →
              </span>
            )}
            <div className="bd-col">
              {slotView(i)}
              {sides(i).map(({ j }) => (
                <div key={j} className="bd-side">
                  <span className="bd-arrow bd-up" aria-hidden="true">
                    ↑
                  </span>
                  {slotView(j)}
                </div>
              ))}
            </div>
          </Fragment>
        ))}
        {cfg.output && (
          <>
            <span className="bd-arrow" aria-hidden="true">
              →
            </span>
            <span className="bd-end">{cfg.output}</span>
          </>
        )}
      </div>
      {!identify && (
        <div className="dnd-tray bd-tray" role="group" aria-label="Stages to place">
          {tray.length === 0 && <span className="shack-label">All stages placed.</span>}
          {tray.map((b) => (
            <button key={b.id} type="button" className="chip dnd-item" disabled={demo} {...dnd.itemProps(b.id)}>
              {b.label}
            </button>
          ))}
        </div>
      )}
      <p className="lab-state" role="status">
        {pickedWrong
          ? `That's the ${pickedWrong.label.toLowerCase()}${pickedWrong.does ? `: it ${pickedWrong.does}` : ""}.`
          : identify && selected === cfg.target
            ? `Yes: the ${block(selected)?.label.toLowerCase()} ${block(selected)?.does ?? ""}.`
            : fBlock && slots[focus!] === fb?.accepts
              ? `${fBlock.label}${fBlock.does ? `: ${fBlock.does}` : ""}.${fb?.out ? ` Signal out: ${fb.out}.` : ""}`
              : identify
                ? "Pick a stage."
                : `${v?.placed ?? 0} of ${v?.total ?? 0} stages in place${v?.wrong ? `, ${v.wrong} in the wrong spot` : ""}.`}
      </p>
      {dnd.ghost && (
        <div
          className="drag-ghost chip dnd-item"
          style={{ transform: `translate(${dnd.ghost.x - 40}px, ${dnd.ghost.y - 22}px)` }}
          aria-hidden="true"
        >
          {block(dnd.ghost.item)?.label}
        </div>
      )}
    </div>
  );
}
