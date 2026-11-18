"use client";
import { useEffect, useRef, useState } from "react";
import { approxEqual, formatQuantity, morseTiming, parseQuantity, toMorse, type Unit } from "@hampath/ham-sim";
import { Button, ExamFact, Feedback, useDragDrop } from "@hampath/ui";
import { Lab } from "@/labs/Lab";
import { track } from "@/lib/api";
import type { Card, Interaction, LabStep } from "@/lib/types";
import { Markdown } from "./Markdown";
import { OhmsTriangle, RelayHook } from "./media";

export interface ScreenProps {
  card: Card;
  /** Mark this screen's requirement as met (enables Continue). */
  onDone: () => void;
  done: boolean;
  /** Shared lesson memory, e.g. the hook's guess. */
  memory: Record<string, string>;
  remember: (k: string, v: string) => void;
  labSteps: LabStep[];
}

export function ScreenTitle({ kicker, children }: { kicker: string; children: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: false });
  }, [children]);
  return (
    <>
      <p className="screen-kicker">{kicker}</p>
      <h1 className="screen-title" tabIndex={-1} ref={ref}>
        {children}
      </h1>
    </>
  );
}

const KICKER: Record<Card["type"], string> = {
  intro: "Introduction",
  hook: "Hook",
  lab: "Explore",
  concept: "Learn",
  predict: "Predict",
  numeric: "Try it",
  worked_example: "Worked example",
  drag_drop: "Match",
  flashcards: "Recall",
  audio: "Listen",
};

/** Concept, hook and worked-example cards (with optional tap-to-reveal). */
export function ConceptScreen({ card, onDone, memory, remember }: ScreenProps) {
  const [open, setOpen] = useState<string | null>(null);
  const reveal = card.interaction?.kind === "reveal" ? card.interaction : null;
  useEffect(onDone, []); // eslint-disable-line react-hooks/exhaustive-deps
  const media =
    card.media === "svg:relay-hook" ? (
      <RelayHook guess={memory.hookGuess ?? null} onGuess={(v) => remember("hookGuess", v)} />
    ) : card.media === "svg:ohms-triangle" ? (
      <div className="panel" style={{ display: "grid", placeItems: "center" }}>
        <OhmsTriangle focus={open} alt={card.mediaAlt ?? ""} />
      </div>
    ) : null;
  return (
    <div className={media ? "screen screen-wide" : "screen screen-narrow"}>
      <div className="screen-text">
        <ScreenTitle kicker={KICKER[card.type]}>{card.title}</ScreenTitle>
        <Markdown>{card.bodyMd}</Markdown>
        {reveal && (
          <div className="screen-text">
            {reveal.prompt && <p className="field-label">{reveal.prompt}</p>}
            <div className="chip-row">
              {reveal.items.map((it) => (
                <button
                  key={it.label}
                  type="button"
                  className="chip"
                  aria-expanded={open === it.label}
                  onClick={() => setOpen(open === it.label ? null : it.label)}
                >
                  {it.label}
                </button>
              ))}
            </div>
            <div aria-live="polite">
              {open && <p className="reveal-answer">{reveal.items.find((i) => i.label === open)?.text}</p>}
            </div>
          </div>
        )}
        {card.examFact && <ExamFact>{card.examFact}</ExamFact>}
      </div>
      {media}
    </div>
  );
}

/** Explore / sandbox lab screens. */
export function LabScreen({ card, onDone }: ScreenProps) {
  const step = card.labStep;
  if (!step) return <p>Lab step missing.</p>;
  return (
    <div className="screen screen-wide">
      <div className="screen-text">
        <ScreenTitle kicker={KICKER.lab}>{card.title}</ScreenTitle>
        <Markdown>{card.bodyMd}</Markdown>
        {card.examFact && <ExamFact>{card.examFact}</ExamFact>}
      </div>
      <Lab
        key={step.id}
        id={step.labId}
        mode={step.goal ? "explore" : "sandbox"}
        config={{
          stepId: step.id,
          prompt: step.prompt,
          config: step.config,
          goal: step.goal,
          goalText: step.goalText,
          hints: step.hints,
          success: step.success,
        }}
        onEvent={(event, payload) => track("/lab-events", { lab_step_id: step.id, event, payload })}
        onGoalMet={onDone}
        onHintsExhausted={onDone}
      />
    </div>
  );
}

export function PredictScreen({ card, onDone, done, labSteps }: ScreenProps) {
  const it = card.interaction as Extract<Interaction, { kind: "predict" }>;
  const [chosen, setChosen] = useState<number | null>(null);
  const reveal = it.reveal_lab_step ? labSteps.find((s) => s.id === it.reveal_lab_step) : undefined;
  return (
    <div className="screen screen-wide">
      <div className="screen-text">
        <ScreenTitle kicker={KICKER.predict}>{card.title}</ScreenTitle>
        <Markdown>{card.bodyMd}</Markdown>
        <fieldset className="choices">
          <legend>{it.prompt}</legend>
          {it.choices.map((c, i) => (
            <button
              key={c.text}
              type="button"
              className="chip"
              aria-pressed={chosen === i}
              disabled={done}
              onClick={() => {
                setChosen(i);
                onDone();
              }}
            >
              {c.text}
            </button>
          ))}
        </fieldset>
        {chosen !== null && (
          <Feedback
            tone={it.choices[chosen]!.correct ? "good" : "bad"}
            title={it.choices[chosen]!.correct ? "Good prediction" : "Not quite"}
          >
            <p>{it.choices[chosen]!.feedback}</p>
          </Feedback>
        )}
      </div>
      {chosen !== null && reveal && (
        <Lab id={reveal.labId} mode="demo" config={{ prompt: reveal.prompt, config: reveal.config }} />
      )}
    </div>
  );
}

export function NumericScreen({ card, onDone, memory }: ScreenProps) {
  const it = card.interaction as Extract<Interaction, { kind: "numeric" }>;
  const [text, setText] = useState("");
  const [tries, setTries] = useState(0);
  const [result, setResult] = useState<"right" | "wrong" | "invalid" | null>(null);
  const [shown, setShown] = useState(false);
  const unit = it.unit as Unit;
  const check = () => {
    const q = parseQuantity(text, unit);
    if (!q || (q.unit && q.unit !== unit)) return setResult("invalid");
    const ok = approxEqual(q.value, it.answer, it.tolerance);
    setTries((t) => t + 1);
    setResult(ok ? "right" : "wrong");
    if (ok) onDone();
  };
  const relay = card.id.endsWith("numeric-relay") && memory.hookGuess;
  return (
    <div className="screen screen-narrow">
      <ScreenTitle kicker={KICKER.numeric}>{card.title}</ScreenTitle>
      <Markdown>{card.bodyMd}</Markdown>
      <form
        className="numeric"
        onSubmit={(e) => {
          e.preventDefault();
          check();
        }}
      >
        <label className="field-label" htmlFor={`${card.id}-n`}>
          {it.prompt}
        </label>
        <div className="numeric-row">
          <input
            id={`${card.id}-n`}
            className="input input-num"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={result === "invalid" || result === "wrong"}
            disabled={result === "right"}
            aria-describedby={`${card.id}-h`}
          />
          <span className="numeric-unit">{unit}</span>
          <Button type="submit" variant="quiet" disabled={!text.trim() || result === "right"}>
            Check
          </Button>
        </div>
        <p id={`${card.id}-h`} className="field-help">
          Number, with or without unit and prefix. Accepted within ±{Math.round(it.tolerance * 100)}%.
        </p>
      </form>
      <div aria-live="polite">
        {result === "invalid" && (
          <Feedback tone="bad" title="That isn’t a number in the right unit">
            <p>Try something like 22 or 22 {unit}.</p>
          </Feedback>
        )}
        {result === "wrong" && (
          <Feedback tone="bad" title="Not yet">
            {it.hint && <p>{it.hint}</p>}
            {tries >= 2 && !shown && (
              <Button
                variant="link"
                onClick={() => {
                  setShown(true);
                  onDone();
                }}
              >
                Show the worked answer
              </Button>
            )}
          </Feedback>
        )}
        {(result === "right" || shown) && (
          <Feedback
            tone={result === "right" ? "good" : "neutral"}
            title={
              result === "right"
                ? `Right: ${formatQuantity(it.answer, unit)}`
                : `Answer: ${formatQuantity(it.answer, unit)}`
            }
          >
            {it.solution && (
              <ol className="steps">
                {it.solution.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            )}
            {relay && (
              <p>
                At the start you picked {memory.hookGuess}. The relay needs 5 V
                {memory.hookGuess === "5 V" ? ": well guessed." : "."}
              </p>
            )}
          </Feedback>
        )}
      </div>
    </div>
  );
}

export function DragDropScreen({ card, onDone }: ScreenProps) {
  const it = card.interaction as Extract<Interaction, { kind: "drag_drop" }>;
  const [placed, setPlaced] = useState<Record<string, string | null>>({});
  const [checked, setChecked] = useState(false);
  const dnd = useDragDrop<string>((item, slot) => {
    setChecked(false);
    setPlaced((p) => {
      const next = { ...p };
      for (const k of Object.keys(next)) if (next[k] === item) next[k] = null;
      next[slot] = item;
      return next;
    });
  });
  const text = (id: string | null | undefined) => it.items.find((i) => i.id === id)?.text;
  const used = new Set(Object.values(placed).filter(Boolean));
  const allRight = it.slots.every((s) => placed[s.id] === s.accepts);
  const full = it.slots.every((s) => placed[s.id]);
  const check = () => {
    setChecked(true);
    if (allRight) onDone();
  };
  return (
    <div className="screen screen-narrow">
      <ScreenTitle kicker={KICKER.drag_drop}>{card.title}</ScreenTitle>
      <p className="field-label" id={`${card.id}-p`}>
        {it.prompt}
      </p>
      <div className="dnd">
        <div className="dnd-tray" role="group" aria-labelledby={`${card.id}-p`}>
          {it.items
            .filter((i) => !used.has(i.id))
            .map((i) => (
              <button key={i.id} type="button" className="chip dnd-item" {...dnd.itemProps(i.id)}>
                {i.text}
              </button>
            ))}
        </div>
        <div className="dnd-slots">
          {it.slots.map((s) => {
            const t = dnd.targetProps(s.id);
            const state = checked ? (placed[s.id] === s.accepts ? "right" : "wrong") : undefined;
            return (
              <button
                key={s.id}
                type="button"
                className="dnd-slot"
                data-drop-target={t["data-drop-target"]}
                data-over={t["data-over"]}
                data-state={state}
                onClick={() => {
                  if (!t.onClick() && placed[s.id]) setPlaced((p) => ({ ...p, [s.id]: null }));
                }}
                onKeyDown={t.onKeyDown}
                aria-label={`${s.label}: ${text(placed[s.id]) ?? "empty"}${state ? (state === "right" ? ", correct" : ", not right") : ""}`}
              >
                <span className="dnd-slot-label">{s.label}</span>
                <span className="dnd-slot-value">{text(placed[s.id]) ?? "Drop here"}</span>
              </button>
            );
          })}
        </div>
        {dnd.ghost && (
          <div
            className="drag-ghost chip dnd-item"
            style={{ transform: `translate(${dnd.ghost.x - 40}px, ${dnd.ghost.y - 22}px)` }}
            aria-hidden="true"
          >
            {text(dnd.ghost.item)}
          </div>
        )}
        <div>
          <Button variant="quiet" onClick={check} disabled={!full}>
            Check
          </Button>
        </div>
        <div aria-live="polite">
          {checked &&
            (allRight ? (
              <Feedback tone="good" title="All matched">
                <Markdown>{card.bodyMd}</Markdown>
              </Feedback>
            ) : (
              <Feedback tone="bad" title="Some are in the wrong place">
                <p>Red slots need a different formula. Select one to take it out.</p>
              </Feedback>
            ))}
        </div>
      </div>
    </div>
  );
}

export function FlashcardsScreen({ card, onDone }: ScreenProps) {
  const it = card.interaction as Extract<Interaction, { kind: "flashcards" }>;
  const [queue, setQueue] = useState(() => it.cards.map((_, i) => i));
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);
  const finished = queue.length === 0;
  useEffect(() => {
    if (finished) onDone();
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps
  const grade = (knewIt: boolean) => {
    const [head, ...rest] = queue;
    setFlipped(false);
    if (knewIt) {
      setKnown((k) => k + 1);
      setQueue(rest);
    } else setQueue([...rest, head!]); // missed cards come back
  };
  const c = finished ? null : it.cards[queue[0]!]!;
  return (
    <div className="screen screen-narrow">
      <ScreenTitle kicker={KICKER.flashcards}>{card.title}</ScreenTitle>
      <Markdown>{card.bodyMd}</Markdown>
      <div className="flash">
        {c ? (
          <>
            <p className="flash-count">
              {known} of {it.cards.length} known
            </p>
            <button
              type="button"
              className="flash-card"
              data-side={flipped ? "back" : "front"}
              onClick={() => setFlipped((f) => !f)}
              aria-live="polite"
              aria-label={`${flipped ? "Answer" : "Question"}: ${flipped ? c.back : c.front}. Press to flip.`}
            >
              <span>
                <span className="flash-side">{flipped ? "Answer" : "Question"}</span>
                {flipped ? c.back : c.front}
              </span>
            </button>
            {flipped ? (
              <div className="chip-row">
                <Button variant="quiet" onClick={() => grade(false)}>
                  Didn’t know it
                </Button>
                <Button variant="quiet" onClick={() => grade(true)}>
                  Knew it
                </Button>
              </div>
            ) : (
              <Button variant="quiet" onClick={() => setFlipped(true)}>
                Flip
              </Button>
            )}
          </>
        ) : (
          <Feedback tone="good" title={`Deck done: ${it.cards.length} cards`}>
            <p>These come back in your daily review.</p>
          </Feedback>
        )}
      </div>
    </div>
  );
}

/** Morse (generated with WebAudio) or an audio file, with speed control and a text equivalent. */
export function AudioScreen({ card, onDone }: ScreenProps) {
  const it = card.interaction as Extract<Interaction, { kind: "audio" }>;
  const [wpm, setWpm] = useState(it.wpm);
  const [playing, setPlaying] = useState(false);
  const [showText, setShowText] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  useEffect(() => () => void ctx.current?.close(), []);
  const play = () => {
    if (it.src) {
      void new Audio(it.src).play();
      if (!it.choices) onDone();
      return;
    }
    ctx.current ??= new AudioContext();
    const ac = ctx.current;
    const { tones, total } = morseTiming(it.morse!, wpm);
    const t0 = ac.currentTime + 0.1;
    const gain = ac.createGain();
    gain.gain.value = 0;
    gain.connect(ac.destination);
    const osc = ac.createOscillator();
    osc.frequency.value = 650;
    osc.connect(gain);
    for (const t of tones) {
      gain.gain.setTargetAtTime(0.3, t0 + t.start, 0.004);
      gain.gain.setTargetAtTime(0, t0 + t.start + t.duration, 0.004);
    }
    osc.start(t0);
    osc.stop(t0 + total + 0.2);
    setPlaying(true);
    osc.onended = () => {
      setPlaying(false);
      if (!it.choices) onDone();
    };
  };
  return (
    <div className="screen screen-narrow">
      <ScreenTitle kicker={KICKER.audio}>{card.title}</ScreenTitle>
      <Markdown>{card.bodyMd}</Markdown>
      <div className="audio">
        <p className="field-label">{it.prompt}</p>
        <div className="audio-row">
          <Button onClick={play} disabled={playing}>
            {playing ? "Playing…" : "Play"}
          </Button>
          {it.morse && (
            <Button variant="quiet" onClick={() => setWpm((w) => (w > 8 ? Math.max(5, w - 5) : it.wpm))}>
              Speed: {wpm} wpm {wpm > 8 ? "(slow down)" : "(reset)"}
            </Button>
          )}
          <Button variant="link" onClick={() => setShowText((s) => !s)} aria-expanded={showText}>
            {showText ? "Hide" : "Show"} {it.morse ? "dots and dashes" : "transcript"}
          </Button>
        </div>
        {showText && <p className="audio-transcript">{it.morse ? toMorse(it.morse) : it.transcript}</p>}
        {it.choices && (
          <fieldset className="choices">
            <legend>What did you hear?</legend>
            {it.choices.map((c, i) => (
              <button
                key={c.text}
                type="button"
                className="chip"
                aria-pressed={chosen === i}
                onClick={() => {
                  setChosen(i);
                  if (c.correct) onDone();
                }}
              >
                {c.text}
              </button>
            ))}
          </fieldset>
        )}
        <div aria-live="polite">
          {chosen !== null &&
            (it.choices![chosen]!.correct ? (
              <Feedback tone="good" title="Correct">
                <p>{it.transcript}</p>
              </Feedback>
            ) : (
              <Feedback tone="bad" title="Not that one">
                <p>Play it again, slower if you like.</p>
              </Feedback>
            ))}
        </div>
      </div>
    </div>
  );
}

export const SCREENS: Record<Card["type"], (p: ScreenProps) => React.ReactNode> = {
  intro: ConceptScreen,
  hook: ConceptScreen,
  concept: ConceptScreen,
  worked_example: ConceptScreen,
  lab: LabScreen,
  predict: PredictScreen,
  numeric: NumericScreen,
  drag_drop: DragDropScreen,
  flashcards: FlashcardsScreen,
  audio: AudioScreen,
};
