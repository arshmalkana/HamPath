"use client";
import { useState } from "react";
import {
  AnalogMeter,
  Button,
  ExamFact,
  Feedback,
  Knob,
  MasteryRing,
  PhaseProgress,
  SevenSegment,
  ToggleSwitch,
  Waterfall,
  WorldMap,
  autoRange,
  formatDial,
} from "@hampath/ui";
import { formatQuantity } from "@hampath/ham-sim";
import { Lab } from "@/labs/Lab";
import { LAB_REGISTRY } from "@/labs/registry";
import { SCREENS } from "@/player/screens";
import type { Card } from "@/lib/types";

const demoCard = (c: Partial<Card> & Pick<Card, "id" | "type" | "title" | "interaction">): Card => ({
  bodyMd: "", media: null, mediaAlt: null, examFact: null, teaches: [], labStepId: null, labStep: null, ...c,
});

const SAMPLE_SCREENS: Card[] = [
  demoCard({ id: "demo/audio", type: "audio", title: "Audio: identify the call", interaction: {
    kind: "audio", prompt: "What is this station sending?", morse: "CQ", wpm: 18, transcript: "CQ: a general call to any station",
    choices: [{ text: "CQ", correct: true }, { text: "QRZ", correct: false }, { text: "SOS", correct: false }],
  } }),
  demoCard({ id: "demo/flash", type: "flashcards", title: "Flashcards: phonetics", interaction: {
    kind: "flashcards", cards: [{ front: "A", back: "Alfa" }, { front: "Q", back: "Quebec" }, { front: "Z", back: "Zulu" }],
  } }),
  demoCard({ id: "demo/dnd", type: "drag_drop", title: "Drag and drop: receiver stages", bodyMd: "A superhet in signal order.", interaction: {
    kind: "drag_drop", prompt: "Put the stages in order.", items: [{ id: "rf", text: "RF amplifier" }, { id: "mix", text: "Mixer" }, { id: "det", text: "Detector" }],
    slots: [{ id: "1", label: "First", accepts: "rf" }, { id: "2", label: "Second", accepts: "mix" }, { id: "3", label: "Third", accepts: "det" }],
  } }),
  demoCard({ id: "demo/numeric", type: "numeric", title: "Numeric: wavelength", interaction: {
    kind: "numeric", prompt: "Wavelength of a 25 MHz signal, in metres?", unit: "m", answer: 12, tolerance: 0.02, hint: "λ = 300 ÷ f (MHz)", solution: ["λ = 300 ÷ 25", "λ = 12 m"],
  } }),
];

/** Living style guide: every design-system component and screen type, keyboard and screen-reader testable. */
export default function ComponentsPage() {
  const [freq, setFreq] = useState(14_074_000);
  const [vol, setVol] = useState(6);
  const [on, setOn] = useState(true);
  const [screen, setScreen] = useState(0);
  const amps = vol / 30;
  const S = SCREENS[SAMPLE_SCREENS[screen]!.type];

  return (
    <main className="container page" id="main">
      <div className="page-head">
        <h1 className="page-title">Components</h1>
        <p className="page-lead">The app theme (switch light and dark in the top bar) and the shack skin used inside labs. Everything here works with the keyboard.</p>
      </div>

      <section className="map-section">
        <h2 className="section-title">App</h2>
        <div className="screen">
          <div className="actions" style={{ marginTop: 0 }}>
            <Button>Primary</Button><Button variant="quiet">Quiet</Button><Button variant="link">Link</Button><Button disabled>Disabled</Button>
          </div>
          <PhaseProgress label="Example progress" phases={[
            { label: "Hook", fill: 1, current: false }, { label: "Explore", fill: 1, current: false }, { label: "Learn", fill: 0.4, current: true },
            { label: "Check", fill: 0, current: false }, { label: "Recap", fill: 0, current: false },
          ]} />
          <div className="recap">
            <div className="ring"><MasteryRing total={11} mastered={3} learning={6} /></div>
            <div className="screen-text">
              <ExamFact>Voltage equals current multiplied by resistance: E = I × R.</ExamFact>
              <Feedback tone="good" title="Correct" />
              <Feedback tone="bad" title="Not quite. One more try."><p>That's 0.5 ÷ 2: current divided by resistance.</p></Feedback>
            </div>
          </div>
        </div>
      </section>

      <section className="map-section">
        <h2 className="section-title">Shack skin</h2>
        <div className="shack shack-panel">
          <div className="shack-row">
            <div className="shack-well" style={{ display: "grid", gap: 8, justifyItems: "start" }}>
              <span className="shack-label">Seven-segment frequency display</span>
              <SevenSegment label="VFO A" value={formatDial(freq)} digits={8} />
            </div>
            <div className="shack-well" style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <Knob label="Tuning (kHz)" value={freq / 1000} min={14000} max={14350} step={0.1} onChange={(k) => setFreq(Math.round(k * 1000))} format={(v) => `${v.toFixed(1)} kHz`} />
              <Knob label="Battery" value={vol} min={0} max={12} step={0.5} onChange={setVol} format={(v) => `${v} V`} />
            </div>
            <div className="shack-well" style={{ display: "grid", gap: 8, alignContent: "start" }}>
              <ToggleSwitch label="Power" checked={on} onChange={setOn} />
            </div>
          </div>
          <div className="shack-row">
            <AnalogMeter label="Current" unit="A" value={on ? amps : 0} max={autoRange(amps)} format={(v) => formatQuantity(v, "A", 3)} />
            <AnalogMeter label="Not connected" unit="V" value={null} max={10} format={(v) => formatQuantity(v, "V", 3)} />
          </div>
          <div className="shack-well">
            <span className="shack-label">Waterfall (arrow keys tune)</span>
            <Waterfall label="20 m waterfall" centerHz={14_074_000} spanHz={6000} tunedHz={freq} onTune={setFreq}
              signals={[{ hz: 14_072_500, width: 60, strength: 0.8, label: "FT8" }, { hz: 14_074_600, width: 50, strength: 0.4, label: "FT8" }, { hz: 14_075_800, width: 2400, strength: 0.25, label: "SSB" }]} />
          </div>
          <div className="shack-well">
            <span className="shack-label">World map and grey line</span>
            <WorldMap date={new Date()} markers={[{ lat: 43.65, lon: -79.38, label: "VA3 Toronto" }, { lat: 51.5, lon: -0.12, label: "G London" }, { lat: -33.87, lon: 151.2, label: "VK2 Sydney" }]} />
          </div>
        </div>
      </section>

      <section className="map-section">
        <h2 className="section-title">Labs: LAB-20 and a placeholder</h2>
        <div className="screen">
          <Lab id="LAB-20" mode="explore" config={{
            prompt: "Build the circuit, close the switch and make 0.2 A flow.",
            goal: "built && closed && approx(I, 0.2)", goalText: "0.2 A", hints: ["Battery left, resistor right, ammeter in the loop.", "Try 6 V."],
            success: "6 V across 30 Ω gives 0.2 A.",
            config: { topology: "single", E: 0, resistors: [30], closed: false, build: true, controls: { E: { min: 0, max: 12, step: 0.5 }, R: false, switch: true }, show: { ammeter: true, voltmeter: true, power: true } },
          }} />
          <Lab id="LAB-27" mode="explore" config={{ prompt: "Tune the ATU until the SWR reads 1:1.", config: {} }} />
          <p className="field-help">{LAB_REGISTRY.filter((l) => l.component).length} of {LAB_REGISTRY.length} labs built; the rest render the placeholder.</p>
        </div>
      </section>

      <section className="map-section">
        <h2 className="section-title">Screen types</h2>
        <div className="chip-row" role="group" aria-label="Choose a screen type" style={{ marginBottom: 24 }}>
          {SAMPLE_SCREENS.map((c, i) => (
            <button key={c.id} type="button" className="chip" aria-pressed={screen === i} onClick={() => setScreen(i)}>{c.type.replace("_", " ")}</button>
          ))}
        </div>
        <S key={SAMPLE_SCREENS[screen]!.id} card={SAMPLE_SCREENS[screen]!} onDone={() => undefined} done={false} memory={{}} remember={() => undefined} labSteps={[]} />
      </section>
    </main>
  );
}
