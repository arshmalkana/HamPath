"use client";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import {
  CORRECT_BOARD,
  SOCKET_ACCEPTS,
  formatQuantity,
  ohmsLabVariables,
  parseQuantity,
  readOhmsLab,
  type Board,
  type OhmsLabState,
  type PartKind,
  type Socket,
  type Topology,
} from "@hampath/ham-sim";
import { AnalogMeter, Knob, ToggleSwitch, autoRange, useDragDrop } from "@hampath/ui";
import { CombinerLab } from "./CombinerLab";
import { NetworkLab } from "./NetworkLab";
import type { LabBodyProps } from "./registry";

type Range = { min: number; max: number; step: number };
interface OhmsConfig {
  topology: Topology;
  E: number;
  resistors: number[];
  closed: boolean;
  build?: boolean;
  /** Parts already on the board when building (LAB-25 Meter Lab pre-wires the battery and resistor). */
  preplaced?: Board;
  /** Parts offered in the tray (default: all four). */
  tray?: PartKind[];
  mode?: "circuit" | "combine";
  controls: { E: Range | false; R: Range | false; switch: boolean; typed?: boolean };
  show: { ammeter: boolean; voltmeter: boolean; power: boolean };
}

const PART_NAMES: Record<PartKind, string> = {
  battery: "Battery",
  resistor: "Resistor",
  ammeter: "Ammeter",
  voltmeter: "Voltmeter",
};
const SOCKET_NAMES: Record<Socket, string> = {
  source: "Power",
  series: "In the loop",
  load: "Load",
  across: "Across the load",
};
const SOCKET_BOX: Record<Socket, { x: number; y: number; w: number; h: number }> = {
  source: { x: 70, y: 95, w: 80, h: 110 },
  series: { x: 245, y: 20, w: 110, h: 60 },
  load: { x: 430, y: 95, w: 80, h: 110 },
  across: { x: 550, y: 95, w: 80, h: 110 },
};
const FAULT_TEXT = {
  gap: "There’s a gap in the loop at the top. Nothing flows until something fills it.",
  "voltmeter-in-series":
    "The voltmeter is in the loop. It lets almost no current through, so it just reads the battery's voltage. Voltmeters go across a part.",
  "ammeter-across-load":
    "Pop! The ammeter is across the resistor. An ammeter is nearly a plain wire, so it short-circuits the resistor and blows its fuse. Ammeters go in the loop.",
} as const;

const fmt = (v: number, u: "V" | "A" | "Ω" | "W") => formatQuantity(v, u, 3);

function PartIcon({ kind, cx, cy, value }: { kind: PartKind; cx: number; cy: number; value?: string }) {
  switch (kind) {
    case "battery":
      return (
        <g aria-hidden="true">
          <line className="part-line" x1={cx} y1={cy - 55} x2={cx} y2={cy - 10} />
          <line className="part-line" x1={cx - 26} y1={cy - 10} x2={cx + 26} y2={cy - 10} strokeWidth={3} />
          <line className="part-line" x1={cx - 14} y1={cy + 6} x2={cx + 14} y2={cy + 6} strokeWidth={6} />
          <line className="part-line" x1={cx} y1={cy + 6} x2={cx} y2={cy + 55} />
          <text className="part-text" x={cx + 20} y={cy - 18}>
            +
          </text>
          {value && (
            <text className="part-value" x={cx - 36} y={cy + 4} textAnchor="end">
              {value}
            </text>
          )}
        </g>
      );
    case "resistor": {
      const zig = Array.from({ length: 7 }, (_, i) => `L${cx + (i % 2 ? 12 : -12)},${cy - 36 + i * 12}`).join(" ");
      return (
        <g aria-hidden="true">
          <path className="part-line" d={`M${cx},${cy - 55} V${cy - 42} ${zig} L${cx},${cy + 42} V${cy + 55}`} />
          {value && (
            <text className="part-value" x={cx - 22} y={cy + 4} textAnchor="end">
              {value}
            </text>
          )}
        </g>
      );
    }
    default: {
      const letter = kind === "ammeter" ? "A" : "V";
      return (
        <g aria-hidden="true">
          <circle className="part" cx={cx} cy={cy} r={24} />
          <text className="part-text" x={cx} y={cy + 6} textAnchor="middle">
            {letter}
          </text>
        </g>
      );
    }
  }
}

function TrayIcon({ kind }: { kind: PartKind }) {
  return (
    <svg viewBox="0 0 40 40" width="28" height="28" aria-hidden="true">
      {kind === "battery" && (
        <>
          <line className="part-line" x1="8" y1="15" x2="32" y2="15" />
          <line className="part-line" x1="14" y1="24" x2="26" y2="24" strokeWidth={5} />
        </>
      )}
      {kind === "resistor" && <path className="part-line" d="M4,20 L9,20 L12,12 L17,28 L22,12 L27,28 L30,20 L36,20" />}
      {(kind === "ammeter" || kind === "voltmeter") && (
        <>
          <circle className="part" cx="20" cy="20" r="14" />
          <text className="part-text" x="20" y="25" textAnchor="middle" fontSize="13">
            {kind === "ammeter" ? "A" : "V"}
          </text>
        </>
      )}
    </svg>
  );
}

/** LAB-20 Ohm's Law Circuit Builder. */
/** LAB-20 Ohm's Law Circuit Builder: single-resistor breadboard, series/parallel networks, or the R/L/C combiner. */
export function OhmsLawLab(props: LabBodyProps) {
  const cfg = props.config as unknown as OhmsConfig;
  if (cfg.mode === "combine") return <CombinerLab {...props} />;
  if (cfg.topology && cfg.topology !== "single") return <NetworkLab {...props} />;
  return <SingleCircuitLab {...props} />;
}

function SingleCircuitLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as OhmsConfig;
  const demo = mode === "demo";
  const [E, setE] = useState(cfg.E);
  const [R, setR] = useState(cfg.resistors[0] ?? 100);
  const [closed, setClosed] = useState(cfg.closed);
  const [board, setBoard] = useState<Board>(cfg.build ? { ...(cfg.preplaced ?? {}) } : CORRECT_BOARD);
  const [message, setMessage] = useState<string>("");
  const [announce, setAnnounce] = useState("");
  const liveId = useId();

  const state: OhmsLabState = useMemo(
    () => ({
      topology: cfg.topology,
      E,
      resistors: [R, ...cfg.resistors.slice(1)],
      closed,
      ...(cfg.build ? { board } : {}),
    }),
    [cfg.topology, cfg.resistors, cfg.build, E, R, closed, board],
  );
  const reading = readOhmsLab(state);

  useEffect(() => {
    onState(ohmsLabVariables(state), state as unknown as Record<string, unknown>);
    const t = setTimeout(() => {
      const parts = [
        `Switch ${closed ? "closed" : "open"}.`,
        `Battery ${fmt(E, "V")}, resistor ${fmt(R, "Ω")}.`,
        reading.ammeter !== null ? `Ammeter ${fmt(reading.ammeter, "A")}.` : "",
        reading.voltmeter !== null ? `Voltmeter ${fmt(reading.voltmeter, "V")}.` : "",
        reading.fault ? FAULT_TEXT[reading.fault] : "",
      ];
      setAnnounce(parts.filter(Boolean).join(" "));
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const place = (part: PartKind, socket: string) => {
    const s = socket as Socket;
    if (!SOCKET_ACCEPTS[s]?.includes(part)) {
      setMessage(`The ${PART_NAMES[part].toLowerCase()} doesn’t fit in "${SOCKET_NAMES[s]}".`);
      return;
    }
    setBoard((b) => {
      const next: Board = { ...b };
      for (const k of Object.keys(next) as Socket[]) if (next[k] === part) next[k] = null;
      next[s] = part;
      return next;
    });
    setMessage(`${PART_NAMES[part]} placed: ${SOCKET_NAMES[s]}.`);
  };
  const dnd = useDragDrop<PartKind>(place);

  const removeFrom = (s: Socket) => {
    const part = board[s];
    if (!part || !cfg.build || demo || (cfg.tray && !cfg.tray.includes(part))) return;
    setBoard((b) => ({ ...b, [s]: null }));
    setMessage(`${PART_NAMES[part]} back in the tray.`);
  };

  const live = reading.I > 0;
  const flowDur = live ? Math.min(8, Math.max(0.35, 0.6 / Math.sqrt(reading.I))) : 0;
  const ammeterFS = autoRange(reading.ammeter ?? 0);
  const voltmeterFS = autoRange(reading.voltmeter ?? 0);
  const placed = new Set(Object.values(board).filter(Boolean));

  const socketEl = (s: Socket): ReactNode => {
    const b = SOCKET_BOX[s];
    const part = board[s];
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const value = part === "battery" ? fmt(E, "V") : part === "resistor" ? fmt(R, "Ω") : undefined;
    const icon = part ? <PartIcon kind={part} cx={cx} cy={cy} value={value} /> : null;
    if (!cfg.build || demo) return <g key={s}>{icon}</g>;
    const t = dnd.targetProps(s);
    const label = part
      ? `${SOCKET_NAMES[s]}: ${PART_NAMES[part]}. ${dnd.selected ? `Press to put the ${PART_NAMES[dnd.selected].toLowerCase()} here` : "Press to take it out"}`
      : `${SOCKET_NAMES[s]}: empty.${dnd.selected ? ` Press to put the ${PART_NAMES[dnd.selected].toLowerCase()} here` : " Pick a part from the tray first"}`;
    return (
      <g
        key={s}
        className="socket-btn"
        role="button"
        tabIndex={0}
        aria-label={label}
        data-drop-target={t["data-drop-target"]}
        onClick={() => {
          if (!t.onClick()) removeFrom(s);
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !dnd.selected) {
            e.preventDefault();
            removeFrom(s);
            return;
          }
          t.onKeyDown(e);
        }}
      >
        <rect className="socket-hole" data-over={t["data-over"]} x={b.x} y={b.y} width={b.w} height={b.h} rx={10} />
        {icon ?? (
          <text className="socket-text" x={cx} y={cy + 4} textAnchor="middle">
            {SOCKET_NAMES[s]}
          </text>
        )}
      </g>
    );
  };

  const applyTyped = (which: "E" | "R", text: string) => {
    const q = parseQuantity(text, which === "E" ? "V" : "Ω");
    if (!q || (q.unit && q.unit !== (which === "E" ? "V" : "Ω")) || q.value < 0 || (which === "R" && q.value <= 0)) {
      setMessage(`"${text}" isn’t a ${which === "E" ? "voltage" : "resistance"}. Try 9, 9 V, 2.2k or 470.`);
      return;
    }
    if (which === "E") setE(q.value);
    else setR(q.value);
    setMessage("");
  };

  const across = board.across;
  return (
    <div className="lab">
      {cfg.build && !demo && (
        <div className="shack-well">
          <p className="shack-label" id={`${liveId}-tray`}>
            Parts tray: drag a part onto the board, or select it and then select a socket.
          </p>
          <div className="tray" role="group" aria-labelledby={`${liveId}-tray`}>
            {(cfg.tray ?? (["battery", "resistor", "ammeter", "voltmeter"] as PartKind[])).map((p) => (
              <button
                key={p}
                type="button"
                className="chip tray-part"
                disabled={placed.has(p)}
                data-placed={placed.has(p)}
                {...dnd.itemProps(p)}
              >
                <TrayIcon kind={p} /> {PART_NAMES[p]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="board shack-well">
        <svg viewBox="0 0 640 300" role="group" aria-label={cfg.build ? "Breadboard" : "Circuit"}>
          <title>{`Circuit: battery ${fmt(E, "V")}, resistor ${fmt(R, "Ω")}, switch ${closed ? "closed" : "open"}`}</title>
          <g aria-hidden="true">
            <path className="wire" data-live={live} d="M110,95 V50 H245" />
            <path className="wire" data-live={live} d="M355,50 H470 V95" />
            <path className="wire" data-live={live} d="M470,205 V250 H330" />
            <path className="wire" data-live={live} d="M270,250 H110 V205" />
            <path className={across === "ammeter" ? "wire" : "lead"} d="M470,80 H590 V95" />
            <path className={across === "ammeter" ? "wire" : "lead"} d="M470,220 H590 V205" />
            <circle className="part" cx="270" cy="250" r="5" />
            <circle className="part" cx="330" cy="250" r="5" />
            <line className="part-line" x1="270" y1="250" x2="330" y2={closed ? 250 : 222} strokeWidth={4} />
            <text className="socket-text" x="300" y="285" textAnchor="middle">
              {closed ? "switch closed" : "switch open"}
            </text>
            {live && (
              <path
                className="flow"
                d="M110,95 V50 H470 V250 H110 Z"
                style={{ ["--flow-dur" as string]: `${flowDur}s` }}
              />
            )}
          </g>
          {(["source", "series", "load", "across"] as Socket[]).map(socketEl)}
        </svg>
        {dnd.ghost && (
          <div
            className="drag-ghost chip"
            style={{ transform: `translate(${dnd.ghost.x - 30}px, ${dnd.ghost.y - 22}px)` }}
            aria-hidden="true"
          >
            <TrayIcon kind={dnd.ghost.item} /> {PART_NAMES[dnd.ghost.item]}
          </div>
        )}
      </div>

      {reading.fault && reading.fault !== "gap" && (
        <p className="lab-fault" role="alert">
          {FAULT_TEXT[reading.fault]}
        </p>
      )}
      {reading.fault === "gap" && <p className="lab-hint">{FAULT_TEXT.gap}</p>}
      {message && (
        <p className="lab-hint" role="status">
          {message}
        </p>
      )}

      <div className="meters2">
        <AnalogMeter
          label="Ammeter"
          unit="A"
          value={reading.ammeter}
          max={ammeterFS}
          format={(v) => fmt(v, "A")}
          overload={reading.fault === "ammeter-across-load"}
        />
        <AnalogMeter
          label="Voltmeter"
          unit="V"
          value={reading.voltmeter}
          max={voltmeterFS}
          format={(v) => fmt(v, "V")}
        />
      </div>
      <dl className="readouts" aria-label="Readouts">
        {[
          ["V across resistor", reading.voltmeter !== null && board.across === "voltmeter" ? fmt(reading.V, "V") : "—"],
          ["I in the loop", reading.ammeter !== null && board.series === "ammeter" ? fmt(reading.I, "A") : "—"],
          ["R", fmt(R, "Ω")],
          ["P in resistor", board.series === "ammeter" && board.across === "voltmeter" ? fmt(reading.P, "W") : "—"],
        ].map(([k, v]) => (
          <div key={k} className="meter">
            <dt className="meter-name">{k}</dt>
            <dd className="readout" style={{ margin: 0 }} data-dim={v === "—"}>
              {v}
            </dd>
          </div>
        ))}
      </dl>

      <div className="controls">
        {cfg.controls.E ? (
          <Knob
            label="Battery voltage"
            value={E}
            {...cfg.controls.E}
            onChange={setE}
            format={(v) => fmt(v, "V")}
            disabled={demo}
          />
        ) : (
          <p className="control-locked">Battery fixed at {fmt(E, "V")}</p>
        )}
        {cfg.controls.R ? (
          <Knob
            label="Resistance"
            value={R}
            {...cfg.controls.R}
            onChange={setR}
            format={(v) => fmt(v, "Ω")}
            disabled={demo}
          />
        ) : (
          <p className="control-locked">Resistor fixed at {fmt(R, "Ω")}</p>
        )}
        {cfg.controls.typed && !demo && (
          <div className="control">
            {(["E", "R"] as const).map((w) => (
              <label key={w} className="typed">
                <span className="control-label">{w === "E" ? "Type E" : "Type R"}</span>
                <input
                  className="input"
                  inputMode="decimal"
                  defaultValue={w === "E" ? String(E) : String(R)}
                  aria-describedby={`${liveId}-typed`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyTyped(w, e.currentTarget.value);
                  }}
                  onBlur={(e) => applyTyped(w, e.currentTarget.value)}
                />
              </label>
            ))}
            <span id={`${liveId}-typed`} className="control-locked">
              Prefixes work: 10m, 2.2k, 470
            </span>
          </div>
        )}
        {cfg.controls.switch ? (
          <ToggleSwitch
            label="Switch"
            checked={closed}
            onChange={setClosed}
            onText="closed"
            offText="open"
            disabled={demo}
          />
        ) : null}
      </div>
      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
